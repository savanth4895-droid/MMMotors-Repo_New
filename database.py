"""
MM Motors — Shared database state, auth helpers, and utilities.

Import from here in any future router modules.
Never import server.py from here — this module has no FastAPI app dependency.
"""
import os
import sys
import certifi
from datetime import datetime, timedelta
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, HTTPException, Query, Cookie
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from passlib.context import CryptContext

# ── Config ─────────────────────────────────────────────────────────────────────
MONGO_URL      = os.getenv("MONGO_URL", "mongodb://localhost:27017").strip()
DB_NAME        = os.getenv("DB_NAME",   "mmmotors")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
JWT_ALGORITHM  = "HS256"
JWT_EXPIRE_MIN = 60 * 12          # 12 hours
MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_MIN  = 30

BRANDS = [
    "HERO", "HONDA", "BAJAJ", "TVS", "YAMAHA", "SUZUKI",
    "ROYAL ENFIELD", "KTM", "PIAGGIO", "APRILIA", "TRIUMPH",
]
GST_RATES = [5, 12, 18]

# Fail fast if JWT secret missing — never run with empty secret
if not JWT_SECRET_KEY:
    print("[MM Motors] FATAL: JWT_SECRET_KEY env var is not set.", file=sys.stderr)
    print('[MM Motors] Generate one: python3 -c "import secrets; print(secrets.token_hex(32))"', file=sys.stderr)
    sys.exit(1)

# ── DB globals ─────────────────────────────────────────────────────────────────
# Populated by server.py lifespan on startup
client = None
db     = None
fs     = None

# ── Auth ────────────────────────────────────────────────────────────────────────
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    expire    = datetime.utcnow() + (expires_delta or timedelta(minutes=JWT_EXPIRE_MIN))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

async def verify_token(mm_token: Optional[str] = Cookie(default=None)) -> dict:
    if not mm_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(mm_token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        uid = payload.get("sub")
        if uid is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"_id": ObjectId(uid), "status": "active"})
        if not user:
            raise HTTPException(status_code=401, detail="User not found or inactive")
        user["id"] = str(user["_id"])
        return user
    except (JWTError, InvalidId):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

async def require_admin(current_user: dict = Depends(verify_token)) -> dict:
    if current_user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Owner access required")
    return current_user

async def require_roles(*roles):
    async def checker(current_user: dict = Depends(verify_token)) -> dict:
        if current_user.get("role") not in roles:
            raise HTTPException(status_code=403, detail=f"Required roles: {roles}")
        return current_user
    return checker

# ── Sequential counters ─────────────────────────────────────────────────────────
_PREFIX = {"invoice": ("INV", 6), "job": ("SRV", 6), "part_bill": ("PRT", 6)}

async def next_sequence(name: str) -> str:
    prefix, pad = _PREFIX[name]
    result = await db.counters.find_one_and_update(
        {"_id": name}, {"$inc": {"seq": 1}}, upsert=True, return_document=True,
    )
    return f"{prefix}-{str(result['seq']).zfill(pad)}"

async def _sync_counter(name: str, collection: str, field: str):
    docs = await db[collection].find({}, {field: 1}).to_list(None)
    nums = []
    for d in docs:
        try:
            nums.append(int(d.get(field, "").split("-")[-1]))
        except Exception:
            pass
    await db.counters.update_one(
        {"_id": name}, {"$set": {"seq": max(nums) if nums else 0}}, upsert=True
    )

# ── Serialization helpers ───────────────────────────────────────────────────────
def oid(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    for k, v in doc.items():
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc

def oids(docs: list) -> list:
    return [oid(d) for d in docs]

def obj_id(s: str) -> ObjectId:
    try:
        return ObjectId(s)
    except InvalidId:
        raise HTTPException(status_code=400, detail=f"Invalid id: {s}")

def paginate_params(page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=500)):
    return {"page": page, "limit": limit, "skip": (page - 1) * limit}

def now() -> str:
    return datetime.utcnow().isoformat()

# ── GST calculation ─────────────────────────────────────────────────────────────
def calc_gst_line(price: float, qty: int, gst_rate: float) -> dict:
    taxable = round(price * qty, 2)
    gst_amt = round(taxable * gst_rate / 100, 2)
    cgst    = round(gst_amt / 2, 2)
    sgst    = round(gst_amt / 2, 2)
    return {
        "taxable": taxable, "cgst": cgst, "sgst": sgst,
        "gst_total": gst_amt, "total": round(taxable + gst_amt, 2),
    }

def calc_bill_totals(items: list) -> dict:
    subtotal = gst_total = 0.0
    gst_break: dict = {}
    for item in items:
        rate = item.get("gst_rate", 18)
        line = calc_gst_line(item["unit_price"], item["qty"], rate)
        subtotal  += line["taxable"]
        gst_total += line["gst_total"]
        slab = str(rate)
        if slab not in gst_break:
            gst_break[slab] = {"taxable": 0, "cgst": 0, "sgst": 0}
        gst_break[slab]["taxable"] += line["taxable"]
        gst_break[slab]["cgst"]    += line["cgst"]
        gst_break[slab]["sgst"]    += line["sgst"]
    return {
        "subtotal":    round(subtotal, 2),
        "gst_total":   round(gst_total, 2),
        "grand_total": round(subtotal + gst_total, 2),
        "gst_breakup": gst_break,
    }

# ── Number to words ─────────────────────────────────────────────────────────────
def _n2w(n: int) -> str:
    a = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten",
         "Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen",
         "Eighteen","Nineteen"]
    b = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"]
    if n == 0:        return "Zero"
    if n < 20:        return a[n]
    if n < 100:       return b[n//10] + (" " + a[n%10] if n%10 else "")
    if n < 1000:      return a[n//100] + " Hundred" + (" " + _n2w(n%100) if n%100 else "")
    if n < 100000:    return _n2w(n//1000) + " Thousand" + (" " + _n2w(n%1000) if n%1000 else "")
    if n < 10000000:  return _n2w(n//100000) + " Lakh" + (" " + _n2w(n%100000) if n%100000 else "")
    return _n2w(n//10000000) + " Crore" + (" " + _n2w(n%10000000) if n%10000000 else "")

def amount_in_words(n: float) -> str:
    return _n2w(int(round(n))) + " Rupees Only"
