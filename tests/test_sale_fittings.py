# _deduct_fittings takes accessory stock off when a bike is sold. A vehicle sale must
# never be blocked by a missing seat cover, so it deducts what is on the shelf and
# reports the rest as "pending" instead of raising. The partial-deduct arithmetic and
# the qty_deducted bookkeeping (which an edit or delete relies on to put stock back)
# are pinned here with a stub DB — no MongoDB needed.
import asyncio
import os
import sys

import pytest
from bson import ObjectId

os.environ.setdefault("JWT_SECRET_KEY", "test-only-secret")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server  # noqa: E402


class _Parts:
    def __init__(self, docs): self.docs = docs
    async def find_one(self, query, projection=None, session=None):
        for d in self.docs:
            if "_id" in query and d["_id"] == query["_id"]:
                return d
            if "part_number" in query and d.get("part_number") == query["part_number"]:
                return d
        return None
    async def update_one(self, query, update, session=None):
        doc = await self.find_one(query)
        if doc is None:
            return None
        for field, delta in (update.get("$inc") or {}).items():
            doc[field] = doc.get(field, 0) + delta
        for field, entry in (update.get("$push") or {}).items():
            doc.setdefault(field, []).append(entry)
        return doc


class _DB:
    def __init__(self, docs): self.spare_parts = _Parts(docs)


def part(part_number, stock, _id=None):
    return {"_id": _id or ObjectId(), "part_number": part_number,
            "name": f"{part_number} cover", "stock": stock}


def deduct(docs, fittings, invoice="INV-000001"):
    original = server.db
    server.db = _DB(docs)
    try:
        return asyncio.run(server._deduct_fittings(fittings, invoice))
    finally:
        server.db = original


def fit(part_number=None, qty=1, price=100.0, free=False, part_id=None, name=None):
    return server.SaleFitting(part_id=part_id, part_number=part_number,
                              name=name or f"{part_number} cover", qty=qty,
                              unit_price=price, complimentary=free)


def test_enough_stock_deducts_everything():
    docs = [part("TANK", 10)]
    items, touched, pending = deduct(docs, [fit("TANK", qty=2)])
    assert docs[0]["stock"] == 8
    assert pending == []
    assert list(touched.values()) == [2]
    assert items[0]["qty"] == 2 and items[0]["qty_deducted"] == 2


def test_partial_stock_takes_what_there_is_and_flags_the_rest():
    docs = [part("GRILL", 1)]
    items, touched, pending = deduct(docs, [fit("GRILL", qty=3)])
    assert docs[0]["stock"] == 0, "must never go negative"
    assert list(touched.values()) == [1]
    assert pending == [{"part_number": "GRILL", "name": "GRILL cover", "qty_short": 2, "untracked": False}]
    # qty_deducted is what a later restore puts back — not the 3 that were fitted.
    assert items[0]["qty"] == 3 and items[0]["qty_deducted"] == 1


def test_no_stock_still_sells_the_bike():
    docs = [part("SEAT", 0)]
    items, touched, pending = deduct(docs, [fit("SEAT", qty=1)])
    assert docs[0]["stock"] == 0
    assert touched == {}
    assert pending[0]["qty_short"] == 1
    assert items[0]["qty_deducted"] == 0


def test_part_not_in_the_list_is_recorded_as_untracked():
    items, touched, pending = deduct([], [fit("MYSTERY", qty=1)])
    assert touched == {}
    assert pending[0]["untracked"] is True
    assert items[0]["qty_deducted"] == 0 and items[0]["part_id"] == ""


def test_free_fitting_is_zero_priced_but_still_leaves_the_shelf():
    docs = [part("FOOTREST", 4)]
    items, _, pending = deduct(docs, [fit("FOOTREST", qty=1, price=250.0, free=True)])
    assert docs[0]["stock"] == 3, "given away, so it still has to come off stock"
    assert pending == []
    assert items[0]["unit_price"] == 0 and items[0]["mrp"] == 250.0
    assert items[0]["complimentary"] is True
    assert docs[0]["stock_log"][0]["reason"] == "complimentary"


def test_stock_log_links_the_movement_to_the_invoice():
    docs = [part("TANK", 5)]
    deduct(docs, [fit("TANK", qty=1)], invoice="INV-000042")
    entry = docs[0]["stock_log"][0]
    assert entry["bill_number"] == "INV-000042"
    assert entry["qty"] == -1 and entry["action"] == "subtract"
    assert entry["reason"] == "sale_fitting"


def test_same_part_on_two_lines_is_summed_for_the_alert():
    docs = [part("TANK", 10)]
    _, touched, _ = deduct(docs, [fit("TANK", qty=2), fit("TANK", qty=3)])
    assert docs[0]["stock"] == 5
    assert list(touched.values()) == [5], "one alert entry, not two"


def test_part_id_is_preferred_and_a_bad_one_falls_back_to_part_number():
    oid = ObjectId()
    docs = [part("TANK", 5, _id=oid)]
    items, _, _ = deduct(docs, [fit("TANK", qty=1, part_id=str(oid))])
    assert items[0]["part_id"] == str(oid) and docs[0]["stock"] == 4

    docs = [part("TANK", 5)]
    items, _, pending = deduct(docs, [fit("TANK", qty=1, part_id="not-an-objectid")])
    assert docs[0]["stock"] == 4 and pending == []


def test_zero_and_negative_quantities_are_skipped():
    docs = [part("TANK", 5)]
    items, touched, pending = deduct(docs, [server.SaleFitting(name="x", part_number="TANK", qty=1)])
    assert len(items) == 1
    # qty has ge=1 on the model, so 0 cannot arrive through the API at all.
    with pytest.raises(Exception):
        server.SaleFitting(name="x", part_number="TANK", qty=0)


def test_no_fittings_at_all():
    assert deduct([], None) == ([], {}, [])
    assert deduct([], []) == ([], {}, [])


@pytest.mark.parametrize("compatible, model, expected", [
    ([], "Shine", True),                       # no models listed → whole brand
    (["SHINE", "SP 125"], "shine", True),      # case ignored
    (["SHINE", "SP 125"], " sp  125 ", True),  # spacing ignored
    (["Activa6G"], "Activa 6G", True),         # spaces ignored entirely
    (["SHINE"], "Unicorn", False),
    (["", " "], "Unicorn", True),              # blank entries don't restrict
    (["Honda Activa 6G"], "Activa 6G", True),  # brand written in front
    (["Honda Activa"], "Activa 6G", False),    # a different model name
])
def test_fits_model(compatible, model, expected):
    assert server.fits_model({"compatible_with": compatible}, model, "HONDA") is expected
