"""
MM Motors — MM Motors Backend
FastAPI + MongoDB Atlas

Collections:
  users, customers, vehicles, sales, service_jobs, service_bills,
  spare_parts, parts_sales, counters, login_attempts

Deploy: Render (backend) · MONGO_URL + DB_NAME + JWT_SECRET_KEY env vars
"""

import asyncio
import traceback
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Optional, List, Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import FastAPI, Depends, HTTPException, status, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, Field
import os
import certifi

# ─── Config ───────────────────────────────────────────────────────────────────
MONGO_URL      = os.getenv("MONGO_URL", "mongodb://localhost:27017").strip()

# Parse and fix MONGO_URL — extract password and truncate to 72 bytes if needed
def _fix_mongo_url(url: str) -> str:
    return url

MONGO_URL = _fix_mongo_url(MONGO_URL)

# Debug — print URL length and password length on startup
try:
    from urllib.parse import urlparse as _urlparse
    _p = _urlparse(MONGO_URL)
    print(f"[MM Motors] MONGO_URL length: {len(MONGO_URL)} chars")
    print(f"[MM Motors] DB host: {_p.hostname}")
    print(f"[MM Motors] DB user: {_p.username}")
    print(f"[MM Motors] Password length: {len((_p.password or '').encode())} bytes")
except Exception as _e:
    print(f"[MM Motors] Could not parse MONGO_URL: {_e}")
DB_NAME        = os.getenv("DB_NAME",        "mmmotors")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-me-in-production-secret-key")
JWT_ALGORITHM  = "HS256"
JWT_EXPIRE_MIN = 60 * 12          # 12 hours
MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_MIN  = 30

BRANDS = [
    "HERO","HONDA","BAJAJ","TVS","YAMAHA","SUZUKI",
    "ROYAL ENFIELD","KTM","PIAGGIO","APRILIA","TRIUMPH"
]

GST_RATES = [5, 12, 18]

# ─── DB ───────────────────────────────────────────────────────────────────────
client: AsyncIOMotorClient = None
db     = None

# ─── Auth helpers (defined early — used in lifespan seed) ─────────────────────
pwd_ctx  = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

@asynccontextmanager
async def lifespan(app):
    # ── startup ──────────────────────────────────────────────────────────────
    global client, db
    try:
        client = AsyncIOMotorClient(
            MONGO_URL,
            serverSelectionTimeoutMS=10000,
            tls=True,
            tlsCAFile=certifi.where(),
        )
        db = client[DB_NAME]
        await _ensure_indexes()
        await _seed_owner()
        print(f"[MM Motors] Connected to MongoDB · DB: {DB_NAME}")
    except Exception as e:
        print(f"[MM Motors] WARNING: DB connection failed: {e}")
        print("[MM Motors] Server starting anyway — check MONGO_URL env var")
    yield
    # ── shutdown ─────────────────────────────────────────────────────────────
    if client:
        client.close()

# ─── App ──────────────────────────────────────────────────────────────────────
# ALLOW_ORIGINS: comma-separated list of allowed origins, e.g.
#   https://mmmotors-frontend.vercel.app,https://custom-domain.com
# Leave unset (or empty) to allow all origins during development.
_raw_origins = os.getenv("ALLOW_ORIGINS", "").strip()
ALLOW_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()] or ["*"]

app = FastAPI(title="MM Motors API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Temporarily allow all — restrict via ALLOW_ORIGINS env var after testing
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

from fastapi import APIRouter
api_router = APIRouter(prefix="/api")

async def _ensure_indexes():
    # users
    await db.users.create_index("username", unique=True)
    await db.users.create_index("mobile")
    # customers
    await db.customers.create_index("mobile")
    await db.customers.create_index([("name","text"),("mobile","text")])
    # vehicles
    await db.vehicles.create_index("chassis_number", unique=True, sparse=True)
    await db.vehicles.create_index("vehicle_number")
    await db.vehicles.create_index("status")
    await db.vehicles.create_index("brand")
    # sales
    await db.sales.create_index("invoice_number", unique=True)
    await db.sales.create_index("customer_id")
    await db.sales.create_index("sale_date")
    # service_jobs
    await db.service_jobs.create_index("job_number", unique=True)
    await db.service_jobs.create_index("status")
    await db.service_jobs.create_index("customer_id")
    await db.service_jobs.create_index("vehicle_number")
    # service_bills
    await db.service_bills.create_index("bill_number", unique=True)
    await db.service_bills.create_index("job_id")
    # spare_parts
    await db.spare_parts.create_index("part_number", unique=True)
    await db.spare_parts.create_index("category")
    await db.spare_parts.create_index([("name","text"),("part_number","text")])
    # parts_sales
    await db.parts_sales.create_index("bill_number", unique=True)
    await db.parts_sales.create_index("sale_date")
    # login_attempts — TTL 30 min
    await db.login_attempts.create_index(
        "created_at", expireAfterSeconds=LOGIN_LOCKOUT_MIN * 60
    )
    await db.login_attempts.create_index("username")
    print("[MM Motors] Indexes ensured")

async def _seed_owner():
    """Create default owner account if no users exist."""
    count = await db.users.count_documents({})
    if count == 0:
        pwd = pwd_ctx.hash("mm@123456")
        await db.users.insert_one({
            "username":   "owner",
            "name":       "Owner",
            "mobile":     "7026263123",
            "email":      "owner@mmmotors.com",
            "role":       "owner",
            "password":   pwd,
            "status":     "active",
            "salary":     0,
            "join_date":  datetime.utcnow().strftime("%d %b %Y"),
            "created_at": datetime.utcnow(),
        })
        print("[MM Motors] Default owner created  username=owner  password=mm@123456")

# ─── Auth helpers ──────────────────────────────────────────────────────────────

def create_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    expire    = datetime.utcnow() + (expires_delta or timedelta(minutes=JWT_EXPIRE_MIN))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

async def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        uid     = payload.get("sub")
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

# ─── Sequential counters ───────────────────────────────────────────────────────
_PREFIX = {
    "invoice":   ("INV", 6),
    "job":       ("SRV", 6),
    "part_bill": ("PRT", 6),
}

async def next_sequence(name: str) -> str:
    prefix, pad = _PREFIX[name]
    result = await db.counters.find_one_and_update(
        {"_id": name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    n = result["seq"]
    return f"{prefix}-{str(n).zfill(pad)}"

async def _sync_counter(name: str, collection: str, field: str):
    """Re-sync counter to max existing number after bulk delete."""
    docs = await db[collection].find({}, {field: 1}).to_list(None)
    nums = []
    for d in docs:
        val = d.get(field, "")
        try:
            nums.append(int(val.split("-")[-1]))
        except (ValueError, AttributeError):
            pass
    max_n = max(nums) if nums else 0
    await db.counters.update_one(
        {"_id": name}, {"$set": {"seq": max_n}}, upsert=True
    )

# ─── Utility helpers ───────────────────────────────────────────────────────────
def oid(doc: dict) -> dict:
    """Serialize ObjectId → str in a document."""
    doc["id"] = str(doc.pop("_id"))
    return doc

def oids(docs: list) -> list:
    return [oid(d) for d in docs]

def obj_id(s: str) -> ObjectId:
    try:
        return ObjectId(s)
    except InvalidId:
        raise HTTPException(status_code=400, detail=f"Invalid id: {s}")

def paginate_params(
    page:  int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
):
    return {"page": page, "limit": limit, "skip": (page - 1) * limit}

def now() -> str:
    return datetime.utcnow().isoformat()

# ─── GST calculation ───────────────────────────────────────────────────────────
def calc_gst_line(price: float, qty: int, gst_rate: float):
    """Return taxable, cgst, sgst, total for a single line item."""
    taxable = round(price * qty, 2)
    gst_amt = round(taxable * gst_rate / 100, 2)
    cgst    = round(gst_amt / 2, 2)
    sgst    = round(gst_amt / 2, 2)
    total   = round(taxable + gst_amt, 2)
    return {"taxable": taxable, "cgst": cgst, "sgst": sgst, "gst_total": gst_amt, "total": total}

def calc_bill_totals(items: list) -> dict:
    """Aggregate GST across all line items grouped by rate."""
    subtotal  = 0.0
    gst_total = 0.0
    gst_break = {}
    for item in items:
        rate    = item.get("gst_rate", 18)
        line    = calc_gst_line(item["unit_price"], item["qty"], rate)
        subtotal  += line["taxable"]
        gst_total += line["gst_total"]
        slab = str(rate)
        if slab not in gst_break:
            gst_break[slab] = {"taxable": 0, "cgst": 0, "sgst": 0}
        gst_break[slab]["taxable"] += line["taxable"]
        gst_break[slab]["cgst"]    += line["cgst"]
        gst_break[slab]["sgst"]    += line["sgst"]
    return {
        "subtotal":  round(subtotal, 2),
        "gst_total": round(gst_total, 2),
        "grand_total": round(subtotal + gst_total, 2),
        "gst_breakup": gst_break,
    }

# ─── Number to words ──────────────────────────────────────────────────────────
def _n2w(n: int) -> str:
    a = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten",
         "Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen",
         "Eighteen","Nineteen"]
    b = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"]
    if n == 0: return "Zero"
    if n < 20:  return a[n]
    if n < 100: return b[n//10] + (" " + a[n%10] if n%10 else "")
    if n < 1000:   return a[n//100]   + " Hundred"  + (" " + _n2w(n%100)    if n%100    else "")
    if n < 100000: return _n2w(n//1000) + " Thousand" + (" " + _n2w(n%1000)  if n%1000  else "")
    if n < 10000000: return _n2w(n//100000) + " Lakh"  + (" " + _n2w(n%100000) if n%100000 else "")
    return _n2w(n//10000000) + " Crore" + (" " + _n2w(n%10000000) if n%10000000 else "")

def amount_in_words(n: float) -> str:
    return _n2w(int(round(n))) + " Rupees Only"

# ═══════════════════════════════════════════════════════════════════════════════
#  PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════════════════════

# ── Auth ──────────────────────────────────────────────────────────────────────
class LoginIn(BaseModel):
    username: str
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         dict

# ── Users / Staff ──────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    username:   str
    name:       str
    mobile:     str
    email:      Optional[str] = ""
    role:       str           = "sales"
    password:   str
    salary:     Optional[float] = 0
    join_date:  Optional[str]   = ""
    status:     Optional[str]   = "active"

class UserUpdate(BaseModel):
    name:      Optional[str]
    mobile:    Optional[str]
    email:     Optional[str]
    role:      Optional[str]
    salary:    Optional[float]
    status:    Optional[str]
    join_date: Optional[str]

class PasswordChange(BaseModel):
    new_password: str

# ── Customers ─────────────────────────────────────────────────────────────────
class CustomerCreate(BaseModel):
    name:    str
    mobile:  str
    email:   Optional[str] = ""
    address: Optional[str] = ""
    gstin:   Optional[str] = ""
    tags:    Optional[List[str]] = []

class CustomerUpdate(BaseModel):
    name:    Optional[str]
    mobile:  Optional[str]
    email:   Optional[str]
    address: Optional[str]
    gstin:   Optional[str]
    tags:    Optional[List[str]]

# ── Vehicles ──────────────────────────────────────────────────────────────────
class VehicleCreate(BaseModel):
    brand:          str
    model:          str
    variant:        Optional[str] = ""
    color:          Optional[str] = ""
    chassis_number: str
    engine_number:  Optional[str] = ""
    vehicle_number: Optional[str] = ""
    key_number:     Optional[str] = ""
    ex_showroom:    float
    type:           str = "new"      # new | used
    status:         str = "in_stock" # in_stock | sold | in_service

class VehicleUpdate(BaseModel):
    brand:          Optional[str]
    model:          Optional[str]
    variant:        Optional[str]
    color:          Optional[str]
    chassis_number: Optional[str]
    engine_number:  Optional[str]
    vehicle_number: Optional[str]
    key_number:     Optional[str]
    ex_showroom:    Optional[float]
    type:           Optional[str]
    status:         Optional[str]

# ── Sales ─────────────────────────────────────────────────────────────────────
class NomineeInfo(BaseModel):
    name:     Optional[str] = ""
    relation: Optional[str] = ""
    age:      Optional[str] = ""

class SaleCreate(BaseModel):
    customer_id:       str
    vehicle_id:        str
    vehicle_number:    Optional[str] = ""
    sale_price:        Optional[float] = 0
    total_amount:      Optional[float] = None   # if set, used directly instead of computing
    discount:          Optional[float] = 0
    insurance:         Optional[float] = 0
    rto:               Optional[float] = 0
    other_charges:     Optional[float] = 0
    other_label:       Optional[str]   = ""
    finance_type:      Optional[str]   = "cash"
    financier:         Optional[str]   = ""
    loan_amount:       Optional[float] = 0
    nominee:           Optional[NomineeInfo] = None
    payment_mode:      Optional[str]   = "Cash"
    sold_by:           Optional[str]   = ""
    sale_date:         Optional[str]   = ""
    notes:             Optional[str]   = ""

class SaleUpdate(BaseModel):
    # Status & logistics
    status:            Optional[str]   = None   # pending | delivered
    delivery_date:     Optional[str]   = None
    vehicle_number:    Optional[str]   = None
    payment_mode:      Optional[str]   = None
    notes:             Optional[str]   = None
    # Customer fields
    customer_name:     Optional[str]   = None
    customer_mobile:   Optional[str]   = None
    customer_address:  Optional[str]   = None
    care_of:           Optional[str]   = None
    # Vehicle swap
    vehicle_id:        Optional[str]   = None   # triggers vehicle status swap
    # Financials
    total_amount:      Optional[float] = None
    sale_price:        Optional[float] = None
    finance_type:      Optional[str]   = None
    financier:         Optional[str]   = None
    loan_amount:       Optional[float] = None
    # Nominee
    nominee:           Optional[NomineeInfo] = None
    # Date
    sale_date:         Optional[str]   = None

# ── Service Jobs ──────────────────────────────────────────────────────────────
class ServiceJobCreate(BaseModel):
    customer_id:    str
    vehicle_number: str
    brand:          str
    model:          str
    variant:        Optional[str] = ""
    odometer_km:    Optional[int] = 0
    complaint:      str
    advisor_id:     Optional[str] = ""
    technician:     Optional[str] = ""
    check_in_date:  Optional[str] = ""
    estimated_delivery: Optional[str] = ""
    notes:          Optional[str] = ""

class ServiceJobUpdate(BaseModel):
    status:         Optional[str]  # pending | in_progress | ready | delivered
    technician:     Optional[str]
    estimated_delivery: Optional[str]
    delivery_date:  Optional[str]
    notes:          Optional[str]
    odometer_out:   Optional[int]

# ── Service Bills ─────────────────────────────────────────────────────────────
class BillLineItem(BaseModel):
    description: str
    part_number: Optional[str] = ""
    hsn_code:    Optional[str] = ""
    qty:         int           = 1
    unit_price:  float
    gst_rate:    float         = 18   # 5 | 12 | 18 | 28

class ServiceBillCreate(BaseModel):
    job_id:          str
    labour_charges:  Optional[float] = 0
    labour_gst_rate: Optional[float] = 18
    items:           Optional[List[BillLineItem]] = []
    payment_mode:    Optional[str] = "Cash"
    notes:           Optional[str] = ""

class ServiceBillUpdate(BaseModel):
    items:           Optional[List[BillLineItem]] = None
    payment_mode:    Optional[str]   = None
    notes:           Optional[str]   = None

# ── Spare Parts ───────────────────────────────────────────────────────────────
class SparePartCreate(BaseModel):
    part_number:     str
    name:            str
    category:        Optional[str] = ""
    brand:           Optional[str] = ""
    compatible_with: Optional[List[str]] = []
    stock:           int    = 0
    reorder_level:   int    = 5
    purchase_price:  float
    selling_price:   float
    gst_rate:        float  = 18
    hsn_code:        Optional[str] = ""
    location:        Optional[str] = ""

class SparePartUpdate(BaseModel):
    name:            Optional[str]
    category:        Optional[str]
    brand:           Optional[str]
    compatible_with: Optional[List[str]]
    stock:           Optional[int]
    reorder_level:   Optional[int]
    purchase_price:  Optional[float]
    selling_price:   Optional[float]
    gst_rate:        Optional[float]
    hsn_code:        Optional[str]
    location:        Optional[str]

class StockAdjust(BaseModel):
    qty:    int    # positive = stock in, negative = adjustment
    reason: Optional[str] = ""

# ── Parts Sales ───────────────────────────────────────────────────────────────
class PartsSaleItem(BaseModel):
    part_id:     str
    part_number: str
    name:        str
    hsn_code:    Optional[str] = ""
    qty:         int
    unit_price:  float
    gst_rate:    float = 18

class PartsSaleCreate(BaseModel):
    customer_name:  Optional[str] = ""
    customer_mobile:Optional[str] = ""
    items:          List[PartsSaleItem]
    payment_mode:   Optional[str] = "Cash"
    sold_by:        Optional[str] = ""
    notes:          Optional[str] = ""

# ═══════════════════════════════════════════════════════════════════════════════
#  HEALTH
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    return {"status": "ok", "service": "MM Motors API", "version": "2.0.0"}

@app.get("/ready")
async def ready():
    try:
        await db.command("ping")
        return {"status": "ready", "db": DB_NAME}
    except Exception as e:
        return JSONResponse(status_code=503, content={"status": "not_ready", "error": str(e)})

# ═══════════════════════════════════════════════════════════════════════════════
#  AUTH
# ═══════════════════════════════════════════════════════════════════════════════

@api_router.post("/auth/login", response_model=TokenOut)
async def login(body: LoginIn):
    username = body.username.strip().lower()

    # Rate limit check
    attempt_count = await db.login_attempts.count_documents({"username": username})
    if attempt_count >= MAX_LOGIN_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail=f"Account locked. Too many failed attempts. Try again in {LOGIN_LOCKOUT_MIN} minutes."
        )

    user = await db.users.find_one({"username": username})
    if not user or not pwd_ctx.verify(body.password, user.get("password", "")):
        await db.login_attempts.insert_one({
            "username": username, "created_at": datetime.utcnow()
        })
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if user.get("status") != "active":
        raise HTTPException(status_code=403, detail="Account is inactive or deactivated")

    # Clear failed attempts on success
    await db.login_attempts.delete_many({"username": username})

    token = create_token({"sub": str(user["_id"]), "role": user["role"]})
    return TokenOut(
        access_token=token,
        user={
            "id":       str(user["_id"]),
            "username": user["username"],
            "name":     user["name"],
            "role":     user["role"],
            "mobile":   user.get("mobile", ""),
        }
    )

@api_router.get("/auth/me")
async def me(current_user: dict = Depends(verify_token)):
    user = dict(current_user)
    user.pop("password", None)
    return user

@api_router.post("/auth/logout")
async def logout(current_user: dict = Depends(verify_token)):
    # JWT is stateless; client drops the token. Optionally add blocklist.
    return {"message": "Logged out"}

# ═══════════════════════════════════════════════════════════════════════════════
#  USERS / STAFF
# ═══════════════════════════════════════════════════════════════════════════════

@api_router.get("/users")
async def list_users(
    p=Depends(paginate_params),
    current_user=Depends(require_admin),
):
    docs  = await db.users.find({}, {"password": 0}).skip(p["skip"]).limit(p["limit"]).to_list(p["limit"])
    total = await db.users.count_documents({})
    return JSONResponse(content=oids(docs), headers={"X-Total-Count": str(total)})

@api_router.post("/users", status_code=201)
async def create_user(body: UserCreate, current_user=Depends(require_admin)):
    existing = await db.users.find_one({"username": body.username.strip().lower()})
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")
    doc = body.dict()
    doc["username"] = doc["username"].strip().lower()
    doc["password"] = pwd_ctx.hash(doc["password"])
    doc["created_at"] = datetime.utcnow()
    result = await db.users.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    doc.pop("password", None)
    return doc

@api_router.get("/users/{user_id}")
async def get_user(user_id: str, current_user=Depends(require_admin)):
    doc = await db.users.find_one({"_id": obj_id(user_id)}, {"password": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    return oid(doc)

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdate, current_user=Depends(require_admin)):
    update = {k: v for k, v in body.dict().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.users.update_one({"_id": obj_id(user_id)}, {"$set": update})
    doc = await db.users.find_one({"_id": obj_id(user_id)}, {"password": 0})
    return oid(doc)

@api_router.post("/users/{user_id}/password")
async def change_password(user_id: str, body: PasswordChange, current_user=Depends(require_admin)):
    hashed = pwd_ctx.hash(body.new_password)
    await db.users.update_one({"_id": obj_id(user_id)}, {"$set": {"password": hashed}})
    return {"message": "Password updated"}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user=Depends(require_admin)):
    if str(current_user["_id"]) == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    result = await db.users.delete_one({"_id": obj_id(user_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Deleted"}

# ═══════════════════════════════════════════════════════════════════════════════
#  CUSTOMERS
# ═══════════════════════════════════════════════════════════════════════════════

@api_router.get("/customers")
async def list_customers(
    search: Optional[str] = Query(None),
    tag:    Optional[str] = Query(None),
    p=Depends(paginate_params),
    current_user=Depends(verify_token),
):
    query: dict = {}
    if search:
        query["$or"] = [
            {"name":   {"$regex": search, "$options": "i"}},
            {"mobile": {"$regex": search, "$options": "i"}},
            {"email":  {"$regex": search, "$options": "i"}},
        ]
    if tag:
        query["tags"] = tag
    docs  = await db.customers.find(query).skip(p["skip"]).limit(p["limit"]).sort("name", 1).to_list(p["limit"])
    total = await db.customers.count_documents(query)
    return JSONResponse(content=oids(docs), headers={"X-Total-Count": str(total)})

@api_router.post("/customers", status_code=201)
async def create_customer(body: CustomerCreate, current_user=Depends(verify_token)):
    doc = body.dict()
    doc["created_at"] = datetime.utcnow().isoformat()
    result = await db.customers.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return doc

@api_router.get("/customers/{cust_id}")
async def get_customer(cust_id: str, current_user=Depends(verify_token)):
    doc = await db.customers.find_one({"_id": obj_id(cust_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Customer not found")
    return oid(doc)

@api_router.put("/customers/{cust_id}")
async def update_customer(cust_id: str, body: CustomerUpdate, current_user=Depends(verify_token)):
    update = {k: v for k, v in body.dict().items() if v is not None}
    await db.customers.update_one({"_id": obj_id(cust_id)}, {"$set": update})
    return oid(await db.customers.find_one({"_id": obj_id(cust_id)}))

@api_router.delete("/customers/{cust_id}")
async def delete_customer(cust_id: str, current_user=Depends(require_admin)):
    result = await db.customers.delete_one({"_id": obj_id(cust_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    return {"message": "Deleted"}

# Customer timeline — all sales + service jobs
@api_router.get("/customers/{cust_id}/timeline")
async def customer_timeline(cust_id: str, current_user=Depends(verify_token)):
    sales, jobs = await asyncio.gather(
        db.sales.find({"customer_id": cust_id}).sort("sale_date", -1).to_list(None),
        db.service_jobs.find({"customer_id": cust_id}).sort("check_in_date", -1).to_list(None),
    )
    return {
        "sales":    oids(sales),
        "service":  oids(jobs),
        "total_sales_spend":   sum(s.get("total_amount", 0) for s in sales),
        "total_service_spend": 0,  # populated from service_bills join if needed
    }

# ═══════════════════════════════════════════════════════════════════════════════
#  VEHICLES
# ═══════════════════════════════════════════════════════════════════════════════

@api_router.get("/vehicles")
async def list_vehicles(
    brand:   Optional[str] = Query(None),
    status:  Optional[str] = Query(None),
    type:    Optional[str] = Query(None),
    search:  Optional[str] = Query(None),
    p=Depends(paginate_params),
    current_user=Depends(verify_token),
):
    query: dict = {}
    if brand:  query["brand"]  = brand.upper()
    if status: query["status"] = status
    if type:   query["type"]   = type
    if search:
        query["$or"] = [
            {"model":          {"$regex": search, "$options": "i"}},
            {"chassis_number": {"$regex": search, "$options": "i"}},
            {"vehicle_number": {"$regex": search, "$options": "i"}},
            {"color":          {"$regex": search, "$options": "i"}},
        ]
    docs  = await db.vehicles.find(query).skip(p["skip"]).limit(p["limit"]).sort("created_at", -1).to_list(p["limit"])
    total = await db.vehicles.count_documents(query)
    return JSONResponse(content=oids(docs), headers={"X-Total-Count": str(total)})

@api_router.post("/vehicles", status_code=201)
async def create_vehicle(body: VehicleCreate, current_user=Depends(verify_token)):
    chassis = body.chassis_number.strip().upper()
    if await db.vehicles.find_one({"chassis_number": chassis}):
        raise HTTPException(status_code=409, detail=f"Chassis number {chassis} already exists")
    doc = body.dict()
    doc["chassis_number"] = chassis
    doc["brand"]          = doc["brand"].upper()
    doc["created_at"]     = datetime.utcnow().isoformat()
    result = await db.vehicles.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return doc

@api_router.get("/vehicles/stats/summary")
async def vehicle_stats(current_user=Depends(verify_token)):
    in_stock, sold, in_service, new_count, used_count = await asyncio.gather(
        db.vehicles.count_documents({"status": "in_stock"}),
        db.vehicles.count_documents({"status": "sold"}),
        db.vehicles.count_documents({"status": "in_service"}),
        db.vehicles.count_documents({"type": "new"}),
        db.vehicles.count_documents({"type": "used"}),
    )
    pipeline = [{"$match": {"status": "in_stock"}}, {"$group": {"_id": None, "total": {"$sum": "$ex_showroom"}}}]
    result   = await db.vehicles.aggregate(pipeline).to_list(1)
    stock_val = result[0]["total"] if result else 0
    return {
        "in_stock": in_stock, "sold": sold, "in_service": in_service,
        "new": new_count, "used": used_count, "stock_value": stock_val,
    }

@api_router.get("/vehicles/{veh_id}")
async def get_vehicle(veh_id: str, current_user=Depends(verify_token)):
    doc = await db.vehicles.find_one({"_id": obj_id(veh_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return oid(doc)

@api_router.put("/vehicles/{veh_id}")
async def update_vehicle(veh_id: str, body: VehicleUpdate, current_user=Depends(verify_token)):
    update = {k: v for k, v in body.dict().items() if v is not None}
    if "chassis_number" in update:
        update["chassis_number"] = update["chassis_number"].strip().upper()
    if "brand" in update:
        update["brand"] = update["brand"].upper()
    await db.vehicles.update_one({"_id": obj_id(veh_id)}, {"$set": update})
    return oid(await db.vehicles.find_one({"_id": obj_id(veh_id)}))

@api_router.delete("/vehicles/{veh_id}")
async def delete_vehicle(veh_id: str, current_user=Depends(require_admin)):
    result = await db.vehicles.delete_one({"_id": obj_id(veh_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return {"message": "Deleted"}

# ═══════════════════════════════════════════════════════════════════════════════
#  SALES
# ═══════════════════════════════════════════════════════════════════════════════

@api_router.get("/sales")
async def list_sales(
    customer_id: Optional[str] = Query(None),
    status:      Optional[str] = Query(None),
    from_date:   Optional[str] = Query(None),
    to_date:     Optional[str] = Query(None),
    search:      Optional[str] = Query(None),
    p=Depends(paginate_params),
    current_user=Depends(verify_token),
):
    query: dict = {}
    if customer_id: query["customer_id"] = customer_id
    if status:      query["status"]      = status
    if search:
        query["$or"] = [
            {"invoice_number":  {"$regex": search, "$options": "i"}},
            {"customer_name":   {"$regex": search, "$options": "i"}},
            {"vehicle_model":   {"$regex": search, "$options": "i"}},
            {"vehicle_number":  {"$regex": search, "$options": "i"}},
        ]
    docs  = await db.sales.find(query).skip(p["skip"]).limit(p["limit"]).sort("created_at", -1).to_list(p["limit"])
    total = await db.sales.count_documents(query)
    return JSONResponse(content=oids(docs), headers={"X-Total-Count": str(total)})

@api_router.post("/sales", status_code=201)
async def create_sale(body: SaleCreate, current_user=Depends(verify_token)):
    # Validate customer
    customer = await db.customers.find_one({"_id": obj_id(body.customer_id)})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Validate vehicle
    vehicle = await db.vehicles.find_one({"_id": obj_id(body.vehicle_id)})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if vehicle.get("status") == "sold":
        raise HTTPException(status_code=409, detail="Vehicle already sold")

    # Calculate totals — honour direct total_amount if supplied (frontend sends this)
    if body.total_amount is not None:
        total_amount = body.total_amount
    else:
        total_amount = (
            (body.sale_price or 0)
            - (body.discount or 0)
            + (body.insurance or 0)
            + (body.rto or 0)
            + (body.other_charges or 0)
        )

    inv_no = await next_sequence("invoice")
    sale_date = body.sale_date or datetime.utcnow().strftime("%d %b %Y")

    doc = {
        "invoice_number": inv_no,
        "customer_id":    body.customer_id,
        "customer_name":  customer["name"],
        "customer_mobile":customer.get("mobile", ""),
        "customer_address":customer.get("address",""),
        "vehicle_id":     body.vehicle_id,
        "vehicle_brand":  vehicle["brand"],
        "vehicle_model":  vehicle["model"],
        "vehicle_variant":vehicle.get("variant",""),
        "vehicle_color":  vehicle.get("color",""),
        "chassis_number": vehicle.get("chassis_number",""),
        "engine_number":  vehicle.get("engine_number",""),
        "vehicle_number": body.vehicle_number or vehicle.get("vehicle_number",""),
        "sale_price":     body.sale_price,
        "discount":       body.discount or 0,
        "insurance":      body.insurance or 0,
        "rto":            body.rto or 0,
        "other_charges":  body.other_charges or 0,
        "other_label":    body.other_label or "",
        "total_amount":   round(total_amount, 2),
        "amount_in_words":amount_in_words(total_amount),
        "finance_type":   body.finance_type or "cash",
        "financier":      body.financier or "",
        "loan_amount":    body.loan_amount or 0,
        "nominee":        body.nominee.dict() if body.nominee else {},
        "payment_mode":   body.payment_mode or "Cash",
        "sold_by":        body.sold_by or current_user.get("name",""),
        "sale_date":      sale_date,
        "status":         "pending",    # pending | delivered
        "notes":          body.notes or "",
        "created_at":     datetime.utcnow().isoformat(),
    }

    result = await db.sales.insert_one(doc)

    # Mark vehicle as sold
    await db.vehicles.update_one(
        {"_id": obj_id(body.vehicle_id)},
        {"$set": {"status": "sold", "sold_date": sale_date, "invoice_number": inv_no}}
    )

    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return doc

@api_router.get("/sales/stats/summary")
async def sales_stats(current_user=Depends(verify_token)):
    today = datetime.utcnow().strftime("%d %b %Y")
    pipeline_total = [{"$group": {"_id": None, "total": {"$sum": "$total_amount"}, "count": {"$sum": 1}}}]
    result = await db.sales.aggregate(pipeline_total).to_list(1)
    all_time = result[0] if result else {"total": 0, "count": 0}
    today_sales = await db.sales.count_documents({"sale_date": today})
    pending     = await db.sales.count_documents({"status": "pending"})
    return {
        "total_count":    all_time.get("count", 0),
        "total_revenue":  all_time.get("total", 0),
        "today_count":    today_sales,
        "pending_delivery": pending,
    }

@api_router.get("/sales/{sale_id}")
async def get_sale(sale_id: str, current_user=Depends(verify_token)):
    doc = await db.sales.find_one({"_id": obj_id(sale_id)})
    if not doc:
        # try invoice_number
        doc = await db.sales.find_one({"invoice_number": sale_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Sale not found")
    return oid(doc)

@api_router.put("/sales/{sale_id}")
async def update_sale(sale_id: str, body: SaleUpdate, current_user=Depends(verify_token)):
    sale = await db.sales.find_one({"_id": obj_id(sale_id)})
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    update: dict = {}

    # Simple scalar fields
    for field in ("status", "delivery_date", "vehicle_number", "payment_mode",
                  "notes", "customer_name", "customer_mobile", "customer_address",
                  "care_of", "total_amount", "sale_price", "finance_type",
                  "financier", "loan_amount", "sale_date"):
        val = getattr(body, field)
        if val is not None:
            update[field] = val

    # Recalculate amount_in_words when total_amount changes
    if "total_amount" in update:
        update["amount_in_words"] = amount_in_words(update["total_amount"])

    # Nominee
    if body.nominee is not None:
        update["nominee"] = body.nominee.dict()

    # Vehicle swap — owner only
    if body.vehicle_id is not None and body.vehicle_id != sale.get("vehicle_id", ""):
        if current_user.get("role") != "owner":
            raise HTTPException(status_code=403, detail="Only owner can change vehicle on a sale")
        new_vehicle = await db.vehicles.find_one({"_id": obj_id(body.vehicle_id)})
        if not new_vehicle:
            raise HTTPException(status_code=404, detail="New vehicle not found")
        if new_vehicle.get("status") == "sold" and str(new_vehicle["_id"]) != sale.get("vehicle_id",""):
            raise HTTPException(status_code=409, detail="Vehicle already sold")
        # Restore old vehicle to in_stock
        if sale.get("vehicle_id"):
            await db.vehicles.update_one(
                {"_id": obj_id(sale["vehicle_id"])},
                {"$set": {"status": "in_stock"}, "$unset": {"sold_date": "", "invoice_number": ""}}
            )
        # Mark new vehicle as sold
        await db.vehicles.update_one(
            {"_id": obj_id(body.vehicle_id)},
            {"$set": {
                "status":         "sold",
                "sold_date":      sale.get("sale_date", ""),
                "invoice_number": sale.get("invoice_number", ""),
            }}
        )
        update["vehicle_id"]      = body.vehicle_id
        update["vehicle_brand"]   = new_vehicle.get("brand", "")
        update["vehicle_model"]   = new_vehicle.get("model", "")
        update["vehicle_variant"] = new_vehicle.get("variant", "")
        update["vehicle_color"]   = new_vehicle.get("color", "")
        update["chassis_number"]  = new_vehicle.get("chassis_number", "")
        update["engine_number"]   = new_vehicle.get("engine_number", "")

    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")

    await db.sales.update_one({"_id": obj_id(sale_id)}, {"$set": update})
    return oid(await db.sales.find_one({"_id": obj_id(sale_id)}))

@api_router.delete("/sales/{sale_id}")
async def delete_sale(sale_id: str, current_user=Depends(require_admin)):
    sale = await db.sales.find_one({"_id": obj_id(sale_id)})
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    # Restore vehicle to in_stock
    await db.vehicles.update_one(
        {"_id": obj_id(sale["vehicle_id"])},
        {"$set": {"status": "in_stock"}, "$unset": {"sold_date": "", "invoice_number": ""}}
    )
    await db.sales.delete_one({"_id": obj_id(sale_id)})
    await _sync_counter("invoice", "sales", "invoice_number")
    return {"message": "Deleted"}


# ═══════════════════════════════════════════════════════════════════════════════
#  SERVICE JOBS
# ═══════════════════════════════════════════════════════════════════════════════

@api_router.get("/service")
async def list_service_jobs(
    status:      Optional[str] = Query(None),
    customer_id: Optional[str] = Query(None),
    technician:  Optional[str] = Query(None),
    search:      Optional[str] = Query(None),
    p=Depends(paginate_params),
    current_user=Depends(verify_token),
):
    query: dict = {}
    if status:      query["status"]      = status
    if customer_id: query["customer_id"] = customer_id
    if technician:  query["technician"]  = technician
    if search:
        query["$or"] = [
            {"job_number":     {"$regex": search, "$options": "i"}},
            {"customer_name":  {"$regex": search, "$options": "i"}},
            {"vehicle_number": {"$regex": search, "$options": "i"}},
            {"model":          {"$regex": search, "$options": "i"}},
            {"complaint":      {"$regex": search, "$options": "i"}},
        ]
    docs  = await db.service_jobs.find(query).skip(p["skip"]).limit(p["limit"]).sort("created_at", -1).to_list(p["limit"])
    total = await db.service_jobs.count_documents(query)
    return JSONResponse(content=oids(docs), headers={"X-Total-Count": str(total)})

@api_router.post("/service", status_code=201)
async def create_service_job(body: ServiceJobCreate, current_user=Depends(verify_token)):
    customer = await db.customers.find_one({"_id": obj_id(body.customer_id)})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    job_no     = await next_sequence("job")
    check_in   = body.check_in_date or datetime.utcnow().strftime("%d %b %Y")

    doc = {
        "job_number":        job_no,
        "customer_id":       body.customer_id,
        "customer_name":     customer["name"],
        "customer_mobile":   customer.get("mobile",""),
        "vehicle_number":    body.vehicle_number.strip().upper(),
        "brand":             body.brand.upper(),
        "model":             body.model,
        "variant":           body.variant or "",
        "odometer_km":       body.odometer_km or 0,
        "odometer_out":      0,
        "complaint":         body.complaint,
        "advisor_id":        body.advisor_id or "",
        "technician":        body.technician or "",
        "check_in_date":     check_in,
        "estimated_delivery":body.estimated_delivery or "",
        "delivery_date":     "",
        "status":            "pending",   # pending | in_progress | ready | delivered
        "notes":             body.notes or "",
        "created_at":        datetime.utcnow().isoformat(),
    }
    result = await db.service_jobs.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return doc

@api_router.get("/service/stats/summary")
async def service_stats(current_user=Depends(verify_token)):
    pending, in_progress, ready, delivered = await asyncio.gather(
        db.service_jobs.count_documents({"status": "pending"}),
        db.service_jobs.count_documents({"status": "in_progress"}),
        db.service_jobs.count_documents({"status": "ready"}),
        db.service_jobs.count_documents({"status": "delivered"}),
    )
    return {
        "pending": pending, "in_progress": in_progress,
        "ready": ready, "delivered": delivered,
        "total_active": pending + in_progress + ready,
    }

@api_router.get("/service/{job_id}")
async def get_service_job(job_id: str, current_user=Depends(verify_token)):
    doc = await db.service_jobs.find_one({"_id": obj_id(job_id)})
    if not doc:
        doc = await db.service_jobs.find_one({"job_number": job_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Service job not found")
    return oid(doc)

@api_router.put("/service/{job_id}")
async def update_service_job(job_id: str, body: ServiceJobUpdate, current_user=Depends(verify_token)):
    update = {k: v for k, v in body.dict().items() if v is not None}
    if "status" in update and update["status"] == "delivered":
        update.setdefault("delivery_date", datetime.utcnow().strftime("%d %b %Y"))
    await db.service_jobs.update_one({"_id": obj_id(job_id)}, {"$set": update})
    return oid(await db.service_jobs.find_one({"_id": obj_id(job_id)}))

@api_router.delete("/service/{job_id}")
async def delete_service_job(job_id: str, current_user=Depends(require_admin)):
    result = await db.service_jobs.delete_one({"_id": obj_id(job_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    # Also delete related bill
    await db.service_bills.delete_many({"job_id": job_id})
    await _sync_counter("job", "service_jobs", "job_number")
    return {"message": "Deleted"}


# ═══════════════════════════════════════════════════════════════════════════════
#  SERVICE BILLS (GST)
# ═══════════════════════════════════════════════════════════════════════════════

@api_router.get("/service-bills")
async def list_service_bills(
    job_id: Optional[str] = Query(None),
    p=Depends(paginate_params),
    current_user=Depends(verify_token),
):
    query = {"job_id": job_id} if job_id else {}
    docs  = await db.service_bills.find(query).skip(p["skip"]).limit(p["limit"]).sort("created_at", -1).to_list(p["limit"])
    total = await db.service_bills.count_documents(query)
    return JSONResponse(content=oids(docs), headers={"X-Total-Count": str(total)})

@api_router.post("/service-bills", status_code=201)
async def create_service_bill(body: ServiceBillCreate, current_user=Depends(verify_token)):
    job = await db.service_jobs.find_one({"_id": obj_id(body.job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Service job not found")
    if await db.service_bills.find_one({"job_id": body.job_id}):
        raise HTTPException(status_code=409, detail="Bill already exists for this job")

    # Build line items with GST
    items_out = []
    for item in (body.items or []):
        line = calc_gst_line(item.unit_price, item.qty, item.gst_rate)
        items_out.append({
            "description": item.description,
            "part_number": item.part_number or "",
            "hsn_code":    item.hsn_code or "",
            "qty":         item.qty,
            "unit_price":  item.unit_price,
            "gst_rate":    item.gst_rate,
            **line,
        })

    # Labour as separate line
    if body.labour_charges and body.labour_charges > 0:
        lab_line = calc_gst_line(body.labour_charges, 1, body.labour_gst_rate or 18)
        items_out.insert(0, {
            "description": "Labour charges",
            "part_number": "", "hsn_code": "9987",
            "qty": 1, "unit_price": body.labour_charges,
            "gst_rate": body.labour_gst_rate or 18,
            **lab_line,
        })

    totals   = calc_bill_totals([{"unit_price": i["unit_price"], "qty": i["qty"], "gst_rate": i["gst_rate"]} for i in items_out])
    bill_no  = await next_sequence("job")  # reuse SRV prefix — alternatively add separate "service_bill" counter

    doc = {
        "bill_number":   bill_no.replace("SRV", "SRV-B"),   # e.g. SRV-B-000041
        "job_id":        body.job_id,
        "job_number":    job.get("job_number",""),
        "customer_id":   job.get("customer_id",""),
        "customer_name": job.get("customer_name",""),
        "customer_mobile":job.get("customer_mobile",""),
        "vehicle_number":job.get("vehicle_number",""),
        "brand":         job.get("brand",""),
        "model":         job.get("model",""),
        "items":         items_out,
        "labour_charges":body.labour_charges or 0,
        **totals,
        "amount_in_words": amount_in_words(totals["grand_total"]),
        "payment_mode":  body.payment_mode or "Cash",
        "notes":         body.notes or "",
        "bill_date":     datetime.utcnow().strftime("%d %b %Y"),
        "created_at":    datetime.utcnow().isoformat(),
    }
    result = await db.service_bills.insert_one(doc)
    # Mark job as ready
    await db.service_jobs.update_one(
        {"_id": obj_id(body.job_id)},
        {"$set": {"status": "ready", "bill_number": doc["bill_number"]}}
    )
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return doc

@api_router.get("/service-bills/{bill_id}")
async def get_service_bill(bill_id: str, current_user=Depends(verify_token)):
    doc = await db.service_bills.find_one({"_id": obj_id(bill_id)})
    if not doc:
        doc = await db.service_bills.find_one({"bill_number": bill_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Bill not found")
    return oid(doc)

@api_router.put("/service-bills/{bill_id}")
async def update_service_bill(bill_id: str, body: ServiceBillUpdate, current_user=Depends(verify_token)):
    bill = await db.service_bills.find_one({"_id": obj_id(bill_id)})
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    update: dict = {}

    if body.payment_mode is not None:
        update["payment_mode"] = body.payment_mode
    if body.notes is not None:
        update["notes"] = body.notes

    if body.items is not None:
        items_out = []
        for item in body.items:
            line = calc_gst_line(item.unit_price, item.qty, item.gst_rate)
            items_out.append({
                "description": item.description,
                "part_number": item.part_number or "",
                "hsn_code":    item.hsn_code or "",
                "qty":         item.qty,
                "unit_price":  item.unit_price,
                "gst_rate":    item.gst_rate,
                **line,
            })
        totals = calc_bill_totals([
            {"unit_price": i["unit_price"], "qty": i["qty"], "gst_rate": i["gst_rate"]}
            for i in items_out
        ])
        update["items"]          = items_out
        update["subtotal"]       = totals["subtotal"]
        update["gst_total"]      = totals["gst_total"]
        update["grand_total"]    = totals["grand_total"]
        update["gst_breakup"]    = totals["gst_breakup"]
        update["amount_in_words"]= amount_in_words(totals["grand_total"])

    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")

    await db.service_bills.update_one({"_id": obj_id(bill_id)}, {"$set": update})
    return oid(await db.service_bills.find_one({"_id": obj_id(bill_id)}))

@api_router.delete("/service-bills/{bill_id}")
async def delete_service_bill(bill_id: str, current_user=Depends(require_admin)):
    bill = await db.service_bills.find_one({"_id": obj_id(bill_id)})
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    await db.service_bills.delete_one({"_id": obj_id(bill_id)})
    # Revert job status
    await db.service_jobs.update_one(
        {"_id": obj_id(bill["job_id"])},
        {"$set": {"status": "in_progress"}, "$unset": {"bill_number": ""}}
    )
    return {"message": "Deleted"}

# ═══════════════════════════════════════════════════════════════════════════════
#  SPARE PARTS
# ═══════════════════════════════════════════════════════════════════════════════

@api_router.get("/parts")
async def list_parts(
    category:   Optional[str] = Query(None),
    brand:      Optional[str] = Query(None),
    low_stock:  Optional[bool]= Query(None),
    out_of_stock:Optional[bool]=Query(None),
    search:     Optional[str] = Query(None),
    p=Depends(paginate_params),
    current_user=Depends(verify_token),
):
    query: dict = {}
    if category: query["category"] = category
    if brand:    query["brand"]    = brand
    if low_stock:
        query["$expr"] = {"$and": [{"$gt": ["$stock", 0]}, {"$lte": ["$stock", "$reorder_level"]}]}
    if out_of_stock:
        query["stock"] = 0
    if search:
        query["$or"] = [
            {"name":        {"$regex": search, "$options": "i"}},
            {"part_number": {"$regex": search, "$options": "i"}},
            {"brand":       {"$regex": search, "$options": "i"}},
        ]
    docs  = await db.spare_parts.find(query).skip(p["skip"]).limit(p["limit"]).sort("name", 1).to_list(p["limit"])
    total = await db.spare_parts.count_documents(query)
    return JSONResponse(content=oids(docs), headers={"X-Total-Count": str(total)})

@api_router.post("/parts", status_code=201)
async def create_part(body: SparePartCreate, current_user=Depends(verify_token)):
    if await db.spare_parts.find_one({"part_number": body.part_number.strip()}):
        raise HTTPException(status_code=409, detail="Part number already exists")
    doc = body.dict()
    doc["part_number"] = doc["part_number"].strip()
    doc["created_at"]  = datetime.utcnow().isoformat()
    result = await db.spare_parts.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return doc

@api_router.get("/parts/stats/summary")
async def parts_stats(current_user=Depends(verify_token)):
    pipeline_val = [
        {"$group": {
            "_id": None,
            "stock_value":  {"$sum": {"$multiply": ["$purchase_price", "$stock"]}},
            "selling_value":{"$sum": {"$multiply": ["$selling_price", "$stock"]}},
            "total_skus":   {"$sum": 1},
        }}
    ]
    result   = await db.spare_parts.aggregate(pipeline_val).to_list(1)
    stats    = result[0] if result else {}
    low, out = await asyncio.gather(
        db.spare_parts.count_documents({"$expr": {"$and": [{"$gt":["$stock",0]},{"$lte":["$stock","$reorder_level"]}]}}),
        db.spare_parts.count_documents({"stock": 0}),
    )
    return {
        "total_skus":    stats.get("total_skus", 0),
        "low_stock":     low,
        "out_of_stock":  out,
        "stock_value":   round(stats.get("stock_value", 0), 2),
        "selling_value": round(stats.get("selling_value", 0), 2),
    }

@api_router.get("/parts/low-stock")
async def low_stock_parts(current_user=Depends(verify_token)):
    """Parts at or below reorder level (excluding out-of-stock)."""
    pipeline = [{"$match": {"$expr": {"$and": [{"$gt":["$stock",0]},{"$lte":["$stock","$reorder_level"]}]}}}]
    docs = await db.spare_parts.aggregate(pipeline).to_list(None)
    return oids(docs)

@api_router.get("/parts/out-of-stock")
async def out_of_stock_parts(current_user=Depends(verify_token)):
    docs = await db.spare_parts.find({"stock": 0}).to_list(None)
    return oids(docs)

@api_router.get("/parts/{part_id}")
async def get_part(part_id: str, current_user=Depends(verify_token)):
    doc = await db.spare_parts.find_one({"_id": obj_id(part_id)})
    if not doc:
        doc = await db.spare_parts.find_one({"part_number": part_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Part not found")
    return oid(doc)

@api_router.put("/parts/{part_id}")
async def update_part(part_id: str, body: SparePartUpdate, current_user=Depends(verify_token)):
    update = {k: v for k, v in body.dict().items() if v is not None}
    await db.spare_parts.update_one({"_id": obj_id(part_id)}, {"$set": update})
    return oid(await db.spare_parts.find_one({"_id": obj_id(part_id)}))

@api_router.post("/parts/{part_id}/adjust-stock")
async def adjust_stock(part_id: str, body: StockAdjust, current_user=Depends(verify_token)):
    part = await db.spare_parts.find_one({"_id": obj_id(part_id)})
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    new_stock = max(0, part["stock"] + body.qty)
    await db.spare_parts.update_one(
        {"_id": obj_id(part_id)},
        {"$set": {"stock": new_stock}, "$push": {"stock_log": {
            "qty": body.qty, "reason": body.reason,
            "new_stock": new_stock, "date": datetime.utcnow().isoformat()
        }}}
    )
    return {"part_id": part_id, "new_stock": new_stock}

@api_router.delete("/parts/{part_id}")
async def delete_part(part_id: str, current_user=Depends(require_admin)):
    result = await db.spare_parts.delete_one({"_id": obj_id(part_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Part not found")
    return {"message": "Deleted"}

# ═══════════════════════════════════════════════════════════════════════════════
#  PARTS SALES (Counter bills with GST)
# ═══════════════════════════════════════════════════════════════════════════════

@api_router.get("/parts-sales")
async def list_parts_sales(
    search: Optional[str] = Query(None),
    p=Depends(paginate_params),
    current_user=Depends(verify_token),
):
    query: dict = {}
    if search:
        query["$or"] = [
            {"bill_number":     {"$regex": search, "$options": "i"}},
            {"customer_name":   {"$regex": search, "$options": "i"}},
            {"customer_mobile": {"$regex": search, "$options": "i"}},
        ]
    docs  = await db.parts_sales.find(query).skip(p["skip"]).limit(p["limit"]).sort("created_at", -1).to_list(p["limit"])
    total = await db.parts_sales.count_documents(query)
    return JSONResponse(content=oids(docs), headers={"X-Total-Count": str(total)})

@api_router.post("/parts-sales", status_code=201)
async def create_parts_sale(body: PartsSaleCreate, current_user=Depends(verify_token)):
    if not body.items:
        raise HTTPException(status_code=400, detail="At least one item required")

    # Build line items + deduct stock
    items_out = []
    for item in body.items:
        part = await db.spare_parts.find_one({"_id": obj_id(item.part_id)})
        if not part:
            raise HTTPException(status_code=404, detail=f"Part {item.part_id} not found")
        if part["stock"] < item.qty:
            raise HTTPException(
                status_code=409,
                detail=f"Insufficient stock for {part['name']} (have {part['stock']}, need {item.qty})"
            )
        line = calc_gst_line(item.unit_price, item.qty, item.gst_rate)
        items_out.append({
            "part_id":    item.part_id,
            "part_number":item.part_number,
            "name":       item.name,
            "hsn_code":   item.hsn_code or part.get("hsn_code",""),
            "qty":        item.qty,
            "unit_price": item.unit_price,
            "gst_rate":   item.gst_rate,
            **line,
        })
        # Deduct stock
        await db.spare_parts.update_one(
            {"_id": obj_id(item.part_id)},
            {"$inc": {"stock": -item.qty}}
        )

    totals  = calc_bill_totals([{"unit_price": i["unit_price"], "qty": i["qty"], "gst_rate": i["gst_rate"]} for i in items_out])
    bill_no = await next_sequence("part_bill")

    doc = {
        "bill_number":    bill_no,
        "customer_name":  body.customer_name or "",
        "customer_mobile":body.customer_mobile or "",
        "items":          items_out,
        **totals,
        "amount_in_words": amount_in_words(totals["grand_total"]),
        "payment_mode":   body.payment_mode or "Cash",
        "sold_by":        body.sold_by or current_user.get("name",""),
        "sale_date":      datetime.utcnow().strftime("%d %b %Y"),
        "notes":          body.notes or "",
        "created_at":     datetime.utcnow().isoformat(),
    }
    result = await db.parts_sales.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return doc

@api_router.get("/parts-sales/{bill_id}")
async def get_parts_sale(bill_id: str, current_user=Depends(verify_token)):
    doc = await db.parts_sales.find_one({"_id": obj_id(bill_id)})
    if not doc:
        doc = await db.parts_sales.find_one({"bill_number": bill_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Bill not found")
    return oid(doc)

@api_router.delete("/parts-sales/{bill_id}")
async def delete_parts_sale(bill_id: str, current_user=Depends(require_admin)):
    bill = await db.parts_sales.find_one({"_id": obj_id(bill_id)})
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    # Restore stock
    for item in bill.get("items", []):
        await db.spare_parts.update_one(
            {"_id": obj_id(item["part_id"])},
            {"$inc": {"stock": item["qty"]}}
        )
    await db.parts_sales.delete_one({"_id": obj_id(bill_id)})
    await _sync_counter("part_bill", "parts_sales", "bill_number")
    return {"message": "Deleted — stock restored"}

# ═══════════════════════════════════════════════════════════════════════════════
#  DASHBOARD STATS
# ═══════════════════════════════════════════════════════════════════════════════

@api_router.get("/dashboard/stats")
async def dashboard_stats(current_user=Depends(verify_token)):
    today = datetime.utcnow().strftime("%d %b %Y")

    (
        vehicles_in_stock, vehicles_sold_today,
        jobs_pending, jobs_in_progress, jobs_ready,
        customers_total,
        parts_low, parts_out,
        sales_today_count,
    ) = await asyncio.gather(
        db.vehicles.count_documents({"status": "in_stock"}),
        db.sales.count_documents({"sale_date": today}),
        db.service_jobs.count_documents({"status": "pending"}),
        db.service_jobs.count_documents({"status": "in_progress"}),
        db.service_jobs.count_documents({"status": "ready"}),
        db.customers.count_documents({}),
        db.spare_parts.count_documents({"$expr": {"$and": [{"$gt":["$stock",0]},{"$lte":["$stock","$reorder_level"]}]}}),
        db.spare_parts.count_documents({"stock": 0}),
        db.sales.count_documents({"sale_date": today}),
    )

    # Revenue aggregations in parallel
    pipeline_today_rev   = [{"$match":{"sale_date": today}},     {"$group":{"_id":None,"total":{"$sum":"$total_amount"}}}]
    pipeline_month_rev   = [{"$match":{"sale_date":{"$regex": datetime.utcnow().strftime("%b %Y")}}}, {"$group":{"_id":None,"total":{"$sum":"$total_amount"}}}]

    today_rev_r, month_rev_r = await asyncio.gather(
        db.sales.aggregate(pipeline_today_rev).to_list(1),
        db.sales.aggregate(pipeline_month_rev).to_list(1),
    )

    return {
        "vehicles": {
            "in_stock":     vehicles_in_stock,
            "sold_today":   vehicles_sold_today,
        },
        "service": {
            "pending":      jobs_pending,
            "in_progress":  jobs_in_progress,
            "ready":        jobs_ready,
            "active_total": jobs_pending + jobs_in_progress + jobs_ready,
        },
        "customers":        customers_total,
        "parts": {
            "low_stock":    parts_low,
            "out_of_stock": parts_out,
        },
        "revenue": {
            "today":        today_rev_r[0]["total"] if today_rev_r else 0,
            "month":        month_rev_r[0]["total"] if month_rev_r else 0,
        },
        "sales_today_count": sales_today_count,
    }

@api_router.get("/dashboard/recent-activity")
async def recent_activity(limit: int = Query(10, le=50), current_user=Depends(verify_token)):
    sales_docs, job_docs, bill_docs = await asyncio.gather(
        db.sales.find({}).sort("created_at", -1).limit(limit).to_list(limit),
        db.service_jobs.find({}).sort("created_at", -1).limit(limit).to_list(limit),
        db.parts_sales.find({}).sort("created_at", -1).limit(limit).to_list(limit),
    )
    activity = []
    for s in sales_docs:
        activity.append({"type":"sale","time":s.get("created_at",""),"text":s.get("invoice_number",""),"sub":f"{s.get('customer_name','')} · ₹{s.get('total_amount',0):,.0f}"})
    for j in job_docs:
        activity.append({"type":"service","time":j.get("created_at",""),"text":j.get("job_number","")+" "+j.get("status",""),"sub":f"{j.get('vehicle_number','')} · {j.get('customer_name','')}"})
    for b in bill_docs:
        activity.append({"type":"parts","time":b.get("created_at",""),"text":b.get("bill_number",""),"sub":f"{b.get('customer_name','')} · ₹{b.get('grand_total',0):,.0f}"})
    activity.sort(key=lambda x: x["time"], reverse=True)
    return activity[:limit]

# ═══════════════════════════════════════════════════════════════════════════════
#  REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@api_router.get("/reports/revenue")
async def revenue_report(
    months: int = Query(6, ge=1, le=24),
    current_user=Depends(require_admin),
):
    """Monthly revenue breakdown: sales + service + parts."""
    pipeline = [
        {"$addFields": {"month_key": {"$substr": ["$created_at", 0, 7]}}},
        {"$group": {
            "_id":     "$month_key",
            "sales":   {"$sum": "$total_amount"},
            "count":   {"$sum": 1},
        }},
        {"$sort": {"_id": -1}},
        {"$limit": months},
    ]
    sales_by_month = await db.sales.aggregate(pipeline).to_list(months)

    svc_pipeline = [
        {"$addFields": {"month_key": {"$substr": ["$created_at", 0, 7]}}},
        {"$group": {"_id": "$month_key", "service": {"$sum": "$grand_total"}}},
        {"$sort": {"_id": -1}},
        {"$limit": months},
    ]
    svc_by_month   = await db.service_bills.aggregate(svc_pipeline).to_list(months)
    parts_pipeline  = [
        {"$addFields": {"month_key": {"$substr": ["$created_at", 0, 7]}}},
        {"$group": {"_id": "$month_key", "parts": {"$sum": "$grand_total"}}},
        {"$sort": {"_id": -1}},
        {"$limit": months},
    ]
    parts_by_month = await db.parts_sales.aggregate(parts_pipeline).to_list(months)

    return {
        "sales":   oids(sales_by_month),
        "service": oids(svc_by_month),
        "parts":   oids(parts_by_month),
    }

@api_router.get("/reports/brand-sales")
async def brand_sales_report(current_user=Depends(require_admin)):
    pipeline = [
        {"$group": {
            "_id":     "$vehicle_brand",
            "units":   {"$sum": 1},
            "revenue": {"$sum": "$total_amount"},
        }},
        {"$sort": {"units": -1}},
    ]
    docs = await db.sales.aggregate(pipeline).to_list(None)
    return [{"brand": d["_id"], "units": d["units"], "revenue": d["revenue"]} for d in docs]

@api_router.get("/reports/top-parts")
async def top_parts_report(limit: int = Query(10), current_user=Depends(require_admin)):
    pipeline = [
        {"$unwind": "$items"},
        {"$group": {
            "_id":     "$items.name",
            "qty":     {"$sum": "$items.qty"},
            "revenue": {"$sum": "$items.total"},
        }},
        {"$sort": {"qty": -1}},
        {"$limit": limit},
    ]
    docs = await db.parts_sales.aggregate(pipeline).to_list(limit)
    return [{"name": d["_id"], "qty_sold": d["qty"], "revenue": round(d["revenue"], 2)} for d in docs]


# ═══════════════════════════════════════════════════════════════════════════════
#  IMPORT PIPELINE
# ═══════════════════════════════════════════════════════════════════════════════

import io
import csv as csv_module
from openpyxl import load_workbook
from openpyxl import Workbook
from fastapi import File, Form, UploadFile
from fastapi.responses import StreamingResponse

import_router = APIRouter(prefix="/api/import", tags=["import"])

# ─── helpers ──────────────────────────────────────────────────────────────────

def safe(val, default=""):
    if val is None or str(val).strip() in ("", "None", "nan"):
        return default
    v = str(val).strip()
    # Convert float-like integers (e.g. "9876543210.0" → "9876543210")
    try:
        f = float(v)
        if f == int(f):
            return str(int(f))
    except (ValueError, TypeError):
        pass
    return v

def safe_float(val, default=0.0) -> float:
    try:
        return float(str(val).replace(",", "").strip())
    except (ValueError, TypeError):
        return default

def safe_int(val, default=0) -> int:
    try:
        return int(float(str(val).replace(",", "").strip()))
    except (ValueError, TypeError):
        return default

def read_file(content: bytes, filename: str) -> list[dict]:
    """Parse Excel or CSV bytes into list of dicts. No pandas needed."""
    name = (filename or "").lower()
    rows = []
    if name.endswith(".csv"):
        text = content.decode("utf-8-sig", errors="replace")
        reader = csv_module.DictReader(io.StringIO(text))
        for row in reader:
            rows.append({k.strip().lower().replace(" ","_").replace("/","_"): safe(v) for k, v in row.items()})
    else:
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        data = list(ws.values)
        wb.close()
        if len(data) < 2:
            return []
        headers = [str(h).strip().lower().replace(" ","_").replace("/","_") if h else f"col{i}"
                   for i, h in enumerate(data[0])]
        for row in data[1:]:
            if all(v is None or str(v).strip() == "" for v in row):
                continue
            rows.append({headers[i]: safe(row[i]) for i in range(min(len(headers), len(row)))})
    return rows

def result_summary(inserted: int, skipped: list, errors: list) -> dict:
    return {
        "inserted":      inserted,
        "skipped_count": len(skipped),
        "error_count":   len(errors),
        "skipped":       skipped[:50],
        "errors":        errors[:50],
    }

# ─── Template download (openpyxl, no pandas) ──────────────────────────────────

TEMPLATES = {
    "customers": {
        "cols": ["name","mobile","email","address","gstin","tags"],
        "rows": [
            ["Ravi Kumar","9876543210","ravi@example.com","12 MG Road, Bengaluru","","VIP"],
            ["Meena S","9845123456","","45 Koramangala","","Regular"],
        ]
    },
    "vehicles": {
        "cols": ["brand","model","variant","color","chassis_number","engine_number","vehicle_number","type"],
        "rows": [
            ["HONDA","Activa 6G","STD","Pearl Black","ME4JF502RH7000001","JF50E7000001","KA01HH1234","new"],
            ["HERO","Splendor+","Self","Heavy Grey","MBLHA10EVHM000002","HA10EAHM00002","KA03AB5678","new"],
        ]
    },
    "sales": {
        "cols": ["customer_name","customer_mobile","vehicle_brand","vehicle_model","chassis_number","engine_number","vehicle_number","vehicle_color","sale_price","discount","insurance","rto","payment_mode","nominee_name","nominee_relation","nominee_age","sale_date"],
        "rows": [
            ["Ravi Kumar","9876543210","HONDA","Activa 6G","ME4JF502RH7000001","JF50E7000001","KA01HH1234","Pearl Black","80500","0","4500","8000","Cash","Balakrishna","Father","54 years","08/04/2026"],
        ]
    },
    "service": {
        "cols": ["customer_name","customer_mobile","vehicle_number","brand","model","odometer_km","complaint","technician","check_in_date","status"],
        "rows": [
            ["Ravi Kumar","9876543210","KA01HH1234","HONDA","Activa 6G","8420","Engine noise","Suresh","07/04/2026","in_progress"],
        ]
    },
    "parts": {
        "cols": ["part_number","name","category","brand","compatible_with","stock","reorder_level","purchase_price","selling_price","gst_rate","hsn_code","location"],
        "rows": [
            ["30050-KWB-901","Spark Plug (Iridium)","Engine","NGK","HONDA,TVS","24","10","180","280","18","8511","A1-R2"],
            ["15400-PLM-A01","Oil Filter","Filters","Honda","HONDA","18","15","120","195","18","8421","A2-R1"],
        ]
    },
    "staff": {
        "cols": ["name","mobile","email","username","role","salary","join_date"],
        "rows": [
            ["Rajesh Kumar","9845001122","rajesh@mmmotors.com","rajesh","sales","18000","01/03/2023"],
            ["Arun Shetty","9566001122","arun@mmmotors.com","arun","service_advisor","20000","01/04/2023"],
        ]
    },
}

@import_router.get("/template/{entity}")
async def download_template(entity: str, current_user=Depends(verify_token)):
    if entity not in TEMPLATES:
        raise HTTPException(status_code=404, detail=f"No template for '{entity}'")
    t   = TEMPLATES[entity]
    wb  = Workbook()
    ws  = wb.active
    ws.title = entity
    ws.append(t["cols"])
    for row in t["rows"]:
        ws.append(row + [""] * (len(t["cols"]) - len(row)))
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="template_{entity}.xlsx"'},
    )

# ─── Preview ──────────────────────────────────────────────────────────────────

@import_router.post("/preview/{entity}")
async def preview_import(entity: str, file: UploadFile = File(...), current_user=Depends(verify_token)):
    if entity not in TEMPLATES:
        raise HTTPException(status_code=404, detail=f"Unknown entity: {entity}")
    content = await file.read()
    rows    = read_file(content, file.filename or "")
    return {
        "entity":        entity,
        "total_rows":    len(rows),
        "columns_found": list(rows[0].keys()) if rows else [],
        "preview":       rows[:10],
        "template_cols": TEMPLATES[entity]["cols"],
    }

# ─── CUSTOMERS ────────────────────────────────────────────────────────────────

@import_router.post("/customers")
async def import_customers(file: UploadFile = File(...), mode: str = Form("skip"), current_user=Depends(verify_token)):
    content = await file.read()
    rows    = read_file(content, file.filename or "")
    if not rows:
        raise HTTPException(status_code=400, detail="File is empty or could not be parsed")
    inserted, skipped, errors = 0, [], []
    for i, row in enumerate(rows):
        rn = i + 2
        try:
            name, mobile = safe(row.get("name")), safe(row.get("mobile"))
            if not name:   skipped.append({"row": rn, "reason": "Missing name"});   continue
            if not mobile: skipped.append({"row": rn, "reason": "Missing mobile"}); continue
            existing = await db.customers.find_one({"mobile": mobile})
            if existing:
                if mode == "overwrite":
                    await db.customers.update_one({"mobile": mobile}, {"$set": {"name": name, "email": safe(row.get("email")), "address": safe(row.get("address")), "tags": [t.strip() for t in safe(row.get("tags","")).split(",") if t.strip()]}})
                    inserted += 1
                else:
                    skipped.append({"row": rn, "reason": f"Mobile {mobile} already exists"})
                continue
            await db.customers.insert_one({"name": name, "mobile": mobile, "email": safe(row.get("email")), "address": safe(row.get("address")), "gstin": safe(row.get("gstin")), "tags": [t.strip() for t in safe(row.get("tags","")).split(",") if t.strip()], "created_at": datetime.utcnow().isoformat()})
            inserted += 1
        except Exception as e:
            traceback.print_exc()
            errors.append({"row": rn, "error": str(e)})
    return result_summary(inserted, skipped, errors)

# ─── VEHICLES ─────────────────────────────────────────────────────────────────

@import_router.post("/vehicles")
async def import_vehicles(file: UploadFile = File(...), mode: str = Form("skip"), current_user=Depends(verify_token)):
    content = await file.read()
    rows    = read_file(content, file.filename or "")
    inserted, skipped, errors = 0, [], []
    for i, row in enumerate(rows):
        rn = i + 2
        try:
            chassis = safe(row.get("chassis_number","")).upper().replace(" ","")
            brand   = safe(row.get("brand","")).upper()
            model   = safe(row.get("model",""))
            if not chassis: skipped.append({"row": rn, "reason": "Missing chassis_number"}); continue
            if not brand:   skipped.append({"row": rn, "reason": "Missing brand"});          continue
            if not model:   skipped.append({"row": rn, "reason": "Missing model"});          continue
            existing = await db.vehicles.find_one({"chassis_number": chassis})
            if existing:
                if mode == "overwrite":
                    await db.vehicles.update_one({"chassis_number": chassis}, {"$set": {"brand": brand, "model": model, "color": safe(row.get("color")), "engine_number": safe(row.get("engine_number")), "vehicle_number": safe(row.get("vehicle_number"))}})
                    inserted += 1
                else:
                    skipped.append({"row": rn, "reason": f"Chassis {chassis} already exists"})
                continue
            await db.vehicles.insert_one({"brand": brand, "model": model, "variant": safe(row.get("variant")), "color": safe(row.get("color")), "chassis_number": chassis, "engine_number": safe(row.get("engine_number")), "vehicle_number": safe(row.get("vehicle_number")), "key_number": safe(row.get("key_number")), "type": safe(row.get("type","new")).lower() or "new", "status": "in_stock", "created_at": datetime.utcnow().isoformat()})
            inserted += 1
        except Exception as e:
            traceback.print_exc()
            errors.append({"row": rn, "error": str(e)})
    return result_summary(inserted, skipped, errors)

# ─── SALES ────────────────────────────────────────────────────────────────────

@import_router.post("/sales")
async def import_sales(file: UploadFile = File(...), mode: str = Form("skip"), current_user=Depends(verify_token)):
    content = await file.read()
    rows    = read_file(content, file.filename or "")
    inserted, skipped, errors = 0, [], []
    for i, row in enumerate(rows):
        rn = i + 2
        try:
            name   = safe(row.get("customer_name"))
            mobile = safe(row.get("customer_mobile"))
            brand  = safe(row.get("vehicle_brand","")).upper()
            model  = safe(row.get("vehicle_model",""))
            price  = safe_float(row.get("sale_price",0))
            chassis = safe(row.get("chassis_number","")).upper().replace(" ","")
            if not name or not mobile or not brand or not model or not price:
                skipped.append({"row": rn, "reason": "Missing required fields"}); continue
            if chassis and await db.sales.find_one({"chassis_number": chassis}):
                skipped.append({"row": rn, "reason": f"Sale for chassis {chassis} already exists"}); continue
            cust = await db.customers.find_one({"mobile": mobile})
            if not cust:
                r = await db.customers.insert_one({"name": name, "mobile": mobile, "email": "", "address": safe(row.get("customer_address","")), "tags": [], "created_at": datetime.utcnow().isoformat()})
                cust_id = str(r.inserted_id)
            else:
                cust_id = str(cust["_id"])
            discount  = safe_float(row.get("discount",0))
            insurance = safe_float(row.get("insurance",0))
            rto       = safe_float(row.get("rto",0))
            total     = price - discount + insurance + rto
            inv_no    = await next_sequence("invoice")
            await db.sales.insert_one({"invoice_number": inv_no, "customer_id": cust_id, "customer_name": name, "customer_mobile": mobile, "vehicle_brand": brand, "vehicle_model": model, "chassis_number": chassis, "engine_number": safe(row.get("engine_number")), "vehicle_number": safe(row.get("vehicle_number")), "sale_price": price, "discount": discount, "insurance": insurance, "rto": rto, "total_amount": round(total,2), "amount_in_words": amount_in_words(total), "payment_mode": safe(row.get("payment_mode","Cash")), "nominee": {"name": safe(row.get("nominee_name")), "relation": safe(row.get("nominee_relation")), "age": safe(row.get("nominee_age"))}, "sale_date": safe(row.get("sale_date","")) or datetime.utcnow().strftime("%d %b %Y"), "status": "delivered", "created_at": datetime.utcnow().isoformat(), "_imported": True})
            inserted += 1
        except Exception as e:
            traceback.print_exc()
            errors.append({"row": rn, "error": str(e)})
    return result_summary(inserted, skipped, errors)

# ─── SERVICE ──────────────────────────────────────────────────────────────────

@import_router.post("/service")
async def import_service(file: UploadFile = File(...), mode: str = Form("skip"), current_user=Depends(verify_token)):
    content = await file.read()
    rows    = read_file(content, file.filename or "")
    inserted, skipped, errors = 0, [], []
    for i, row in enumerate(rows):
        rn = i + 2
        try:
            name    = safe(row.get("customer_name"))
            mobile  = safe(row.get("customer_mobile"))
            veh_no  = safe(row.get("vehicle_number","")).upper()
            complaint = safe(row.get("complaint",""))
            check_in  = safe(row.get("check_in_date","")) or datetime.utcnow().strftime("%d %b %Y")
            if not veh_no or not complaint: skipped.append({"row": rn, "reason": "Missing vehicle_number or complaint"}); continue
            if await db.service_jobs.find_one({"vehicle_number": veh_no, "check_in_date": check_in}):
                skipped.append({"row": rn, "reason": f"Job for {veh_no} on {check_in} exists"}); continue
            cust = await db.customers.find_one({"mobile": mobile}) if mobile else None
            if not cust and name:
                r = await db.customers.insert_one({"name": name, "mobile": mobile, "email": "", "address": "", "tags": [], "created_at": datetime.utcnow().isoformat()})
                cust_id = str(r.inserted_id)
            else:
                cust_id = str(cust["_id"]) if cust else ""
            status = safe(row.get("status","delivered")).lower()
            if status not in ("pending","in_progress","ready","delivered"): status = "delivered"
            job_no = await next_sequence("job")
            await db.service_jobs.insert_one({"job_number": job_no, "customer_id": cust_id, "customer_name": name or "", "customer_mobile": mobile or "", "vehicle_number": veh_no, "brand": safe(row.get("brand","")).upper(), "model": safe(row.get("model","")), "odometer_km": safe_int(row.get("odometer_km",0)), "complaint": complaint, "technician": safe(row.get("technician","")), "check_in_date": check_in, "status": status, "created_at": datetime.utcnow().isoformat(), "_imported": True})
            inserted += 1
        except Exception as e:
            traceback.print_exc()
            errors.append({"row": rn, "error": str(e)})
    return result_summary(inserted, skipped, errors)

# ─── PARTS ────────────────────────────────────────────────────────────────────

@import_router.post("/parts")
async def import_parts(file: UploadFile = File(...), mode: str = Form("skip"), current_user=Depends(verify_token)):
    content = await file.read()
    rows    = read_file(content, file.filename or "")
    inserted, skipped, errors = 0, [], []
    for i, row in enumerate(rows):
        rn = i + 2
        try:
            part_no = safe(row.get("part_number","")).strip()
            name    = safe(row.get("name",""))
            if not part_no: skipped.append({"row": rn, "reason": "Missing part_number"}); continue
            if not name:    skipped.append({"row": rn, "reason": "Missing name"});        continue
            existing = await db.spare_parts.find_one({"part_number": part_no})
            if existing:
                if mode == "overwrite":
                    await db.spare_parts.update_one({"part_number": part_no}, {"$set": {"name": name, "stock": safe_int(row.get("stock",existing["stock"])), "selling_price": safe_float(row.get("selling_price",existing["selling_price"])), "purchase_price": safe_float(row.get("purchase_price",existing["purchase_price"]))}})
                    inserted += 1
                else:
                    skipped.append({"row": rn, "reason": f"Part {part_no} already exists"})
                continue
            compat_raw = safe(row.get("compatible_with",""))
            await db.spare_parts.insert_one({"part_number": part_no, "name": name, "category": safe(row.get("category","")), "brand": safe(row.get("brand","")), "compatible_with": [c.strip().upper() for c in compat_raw.split(",") if c.strip()], "stock": safe_int(row.get("stock",0)), "reorder_level": safe_int(row.get("reorder_level",5)), "purchase_price": safe_float(row.get("purchase_price",0)), "selling_price": safe_float(row.get("selling_price",0)), "gst_rate": safe_float(row.get("gst_rate",18)), "hsn_code": safe(row.get("hsn_code","")), "location": safe(row.get("location","")), "created_at": datetime.utcnow().isoformat()})
            inserted += 1
        except Exception as e:
            traceback.print_exc()
            errors.append({"row": rn, "error": str(e)})
    return result_summary(inserted, skipped, errors)

# ─── STAFF ────────────────────────────────────────────────────────────────────

@import_router.post("/staff")
async def import_staff(file: UploadFile = File(...), mode: str = Form("skip"), current_user=Depends(require_admin)):
    content = await file.read()
    rows    = read_file(content, file.filename or "")
    inserted, skipped, errors = 0, [], []
    valid_roles = {"owner","sales","service_advisor","parts_counter","technician"}
    for i, row in enumerate(rows):
        rn = i + 2
        try:
            name     = safe(row.get("name",""))
            username = safe(row.get("username","")).strip().lower()
            role     = safe(row.get("role","sales")).strip().lower()
            if not name or not username: skipped.append({"row": rn, "reason": "Missing name or username"}); continue
            if role not in valid_roles:  skipped.append({"row": rn, "reason": f"Invalid role: {role}"});   continue
            existing = await db.users.find_one({"username": username})
            if existing:
                if mode == "overwrite":
                    await db.users.update_one({"username": username}, {"$set": {"name": name, "role": role, "salary": safe_float(row.get("salary",0))}})
                    inserted += 1
                else:
                    skipped.append({"row": rn, "reason": f"Username {username} already exists"})
                continue
            await db.users.insert_one({"username": username, "name": name, "mobile": safe(row.get("mobile","")), "email": safe(row.get("email","")), "role": role, "password": pwd_ctx.hash("mm@123456"), "salary": safe_float(row.get("salary",0)), "join_date": safe(row.get("join_date","")), "status": "active", "created_at": datetime.utcnow().isoformat()})
            inserted += 1
        except Exception as e:
            traceback.print_exc()
            errors.append({"row": rn, "error": str(e)})
    return result_summary(inserted, skipped, errors)

# ─── CLEAR ────────────────────────────────────────────────────────────────────

@import_router.delete("/clear/{entity}")
async def clear_entity(entity: str, current_user=Depends(require_admin)):
    entity_map = {
        "customers":  ("customers",   None,         None),
        "vehicles":   ("vehicles",    None,         None),
        "sales":      ("sales",       "invoice",    "invoice_number"),
        "service":    ("service_jobs","job",         "job_number"),
        "parts":      ("spare_parts", None,         None),
        "parts_sales":("parts_sales", "part_bill",  "bill_number"),
    }
    if entity not in entity_map:
        raise HTTPException(status_code=400, detail=f"Cannot clear '{entity}'")
    coll, counter_name, counter_field = entity_map[entity]
    result = await db[coll].delete_many({})
    if counter_name and counter_field:
        await _sync_counter(counter_name, coll, counter_field)
    return {"entity": entity, "deleted": result.deleted_count}

@import_router.get("/counts")
async def import_counts(current_user=Depends(verify_token)):
    counts = await asyncio.gather(
        db.customers.count_documents({}),
        db.vehicles.count_documents({}),
        db.sales.count_documents({}),
        db.service_jobs.count_documents({}),
        db.spare_parts.count_documents({}),
        db.parts_sales.count_documents({}),
        db.users.count_documents({}),
    )
    return {"customers": counts[0], "vehicles": counts[1], "sales": counts[2], "service_jobs": counts[3], "spare_parts": counts[4], "parts_sales": counts[5], "users": counts[6]}

# ═══════════════════════════════════════════════════════════════════════════════
#  Mount router & run
# ═══════════════════════════════════════════════════════════════════════════════

app.include_router(api_router)
app.include_router(import_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
