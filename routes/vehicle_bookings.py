"""API routes: vehicle bookings (split out of server.py; code moved verbatim)."""
import re
from typing import Optional
from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel, Field
from database import verify_token, require_admin, next_sequence, oid, oids, obj_id, utcnow, ist_now, norm_brand
from routers import api_router

# Set by server.py's lifespan (and by tests/conftest.py) once Mongo is connected.
db = None
fs = None

# ═══════════════════════════════════════════════════════════════════════════════
#  VEHICLE BOOKINGS — advance paid for a new bike not yet in stock; waiting list
# ═══════════════════════════════════════════════════════════════════════════════
VEHICLE_BOOKING_STATUSES = ("waiting", "arrived", "delivered", "cancelled")

class VehicleBookingCreate(BaseModel):
    customer_name:   str = Field(..., min_length=1, max_length=120)
    customer_mobile: str = Field(..., pattern=r"^\d{10}$")
    customer_id:     Optional[str] = ""
    brand:           str = Field(..., min_length=1, max_length=40)
    model:           str = Field(..., min_length=1, max_length=80)
    variant:         Optional[str] = Field("", max_length=80)
    color:           Optional[str] = Field("", max_length=40)
    advance_amount:  float = Field(..., ge=0, le=10_000_000)
    payment_mode:    Optional[str] = "Cash"
    booking_date:    Optional[str] = Field("", pattern=r"^(\d{4}-\d{2}-\d{2})?$")   # blank = today
    expected_date:   Optional[str] = Field("", pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    notes:           Optional[str] = Field("", max_length=1000)

class VehicleBookingUpdate(BaseModel):
    customer_name:   Optional[str] = Field(None, min_length=1, max_length=120)
    customer_mobile: Optional[str] = Field(None, pattern=r"^\d{10}$")
    brand:           Optional[str] = Field(None, min_length=1, max_length=40)
    model:           Optional[str] = Field(None, min_length=1, max_length=80)
    variant:         Optional[str] = Field(None, max_length=80)
    color:           Optional[str] = Field(None, max_length=40)
    advance_amount:  Optional[float] = Field(None, ge=0, le=10_000_000)
    payment_mode:    Optional[str] = None
    booking_date:    Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    expected_date:   Optional[str] = Field(None, pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    notes:           Optional[str] = Field(None, max_length=1000)
    status:          Optional[str] = None
    invoice_number:  Optional[str] = Field(None, max_length=40)    # when delivered
    refund_amount:   Optional[float] = Field(None, ge=0, le=10_000_000)  # when cancelled
    cancel_reason:   Optional[str] = Field(None, max_length=300)

def _bk_key(s) -> str:
    return " ".join(str(s or "").upper().split())

def booking_matches(booking: dict, stock: list) -> int:
    """In-stock vehicles that fit this booking: same brand and model, and the same colour
    when the customer asked for one. Variant is ignored — staff confirm it on the phone."""
    want = (_bk_key(booking.get("brand")), _bk_key(booking.get("model")), _bk_key(booking.get("color")))
    return sum(1 for v in stock
               if (_bk_key(v.get("brand")), _bk_key(v.get("model"))) == want[:2]
               and (not want[2] or _bk_key(v.get("color")) == want[2]))

async def _in_stock_vehicles() -> list:
    return await db.vehicles.find({"status": "in_stock"}, {"brand": 1, "model": 1, "color": 1}).to_list(None)

@api_router.get("/vehicle-bookings")
async def list_vehicle_bookings(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None, max_length=60),
    current_user=Depends(verify_token),
):
    q: dict = {}
    if status in VEHICLE_BOOKING_STATUSES:
        q["status"] = status
    if search:
        esc = re.escape(search.strip())
        q["$or"] = [{f: {"$regex": esc, "$options": "i"}}
                    for f in ("booking_number", "customer_name", "customer_mobile", "model", "brand")]
    docs  = await db.vehicle_bookings.find(q).sort("created_at", -1).to_list(2000)
    stock = await _in_stock_vehicles()
    for d in docs:
        d["in_stock_matches"] = booking_matches(d, stock) if d.get("status") in ("waiting", "arrived") else 0
    return oids(docs)

@api_router.post("/vehicle-bookings", status_code=201)
async def create_vehicle_booking(body: VehicleBookingCreate, current_user=Depends(verify_token)):
    doc = {
        **body.dict(),
        "booking_number": await next_sequence("booking"),
        "brand":          norm_brand(body.brand),
        "customer_name":  body.customer_name.strip(),
        "status":         "waiting",
        "booking_date":   body.booking_date or ist_now().strftime("%Y-%m-%d"),
        "created_by":     current_user.get("name", "") or current_user.get("username", ""),
        "created_at":     utcnow().isoformat(),
    }
    res = await db.vehicle_bookings.insert_one(doc)
    doc["id"] = str(res.inserted_id); doc.pop("_id", None)
    return doc

@api_router.put("/vehicle-bookings/{booking_id}")
async def update_vehicle_booking(booking_id: str, body: VehicleBookingUpdate, current_user=Depends(verify_token)):
    booking = await db.vehicle_bookings.find_one({"_id": obj_id(booking_id)})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    update = {k: v for k, v in body.dict().items() if v is not None}
    if "status" in update and update["status"] not in VEHICLE_BOOKING_STATUSES:
        raise HTTPException(status_code=400, detail="Unknown booking status")
    if update.get("status") == "delivered" and not (update.get("invoice_number") or booking.get("invoice_number")):
        raise HTTPException(status_code=400, detail="Enter the sale invoice number to mark it delivered")
    if "brand" in update:
        update["brand"] = norm_brand(update["brand"])
    if update.get("refund_amount", 0) > (update.get("advance_amount") or booking.get("advance_amount", 0)):
        raise HTTPException(status_code=400, detail="Refund can't be more than the advance paid")
    if "status" in update and update["status"] != booking.get("status"):
        update[f"{update['status']}_at"] = utcnow().isoformat()
    await db.vehicle_bookings.update_one({"_id": booking["_id"]}, {"$set": update})
    return oid(await db.vehicle_bookings.find_one({"_id": booking["_id"]}))

@api_router.delete("/vehicle-bookings/{booking_id}")
async def delete_vehicle_booking(booking_id: str, current_user=Depends(require_admin)):
    res = await db.vehicle_bookings.delete_one({"_id": obj_id(booking_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Booking not found")
    return {"message": "Deleted"}
