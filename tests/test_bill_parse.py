# Reading a supplier bill: Claude's answer is stubbed with lines from a real Moksh Auto
# Point invoice, so this pins what happens after the read — vendor match, part matching
# and the numbers the review form gets. Stub DB — no MongoDB or API key needed.
import asyncio
import io
import os
import re
import sys

import pytest
from bson import ObjectId
from fastapi import HTTPException
from starlette.datastructures import UploadFile

os.environ.setdefault("JWT_SECRET_KEY", "test-only-secret")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server  # noqa: E402


def _ok(value, cond):
    if isinstance(cond, dict) and "$regex" in cond:
        return isinstance(value, str) and re.search(cond["$regex"], value, re.I) is not None
    return value == cond


def _match(doc, query):
    for k, v in query.items():
        if k == "$or":
            if not any(_match(doc, q) for q in v):
                return False
        elif isinstance(v, dict) and "$elemMatch" in v:
            if not any(_match(a, v["$elemMatch"]) for a in doc.get(k, [])):
                return False
        elif not _ok(doc.get(k), v):
            return False
    return True


class _Cursor:
    def __init__(self, docs): self.docs = docs
    def limit(self, n): self.docs = self.docs[:n]; return self
    async def to_list(self, n): return self.docs[:n]


class _Coll:
    def __init__(self, docs): self.docs = docs
    async def find_one(self, query): return next((d for d in self.docs if _match(d, query)), None)
    def find(self, query): return _Cursor([d for d in self.docs if _match(d, query)])


class _DB:
    def __init__(self, vendors, parts):
        self.vendors, self.spare_parts = _Coll(vendors), _Coll(parts)


VENDOR = {"_id": ObjectId(), "name": "Moksh Auto Point", "gstin": "29ABNFM7338R1Z3"}
CHAIN  = {"_id": ObjectId(), "name": "Chain Kit TVS XL", "part_number": "MM-0101", "purchase_price": 560,
          "selling_price": 930, "stock": 2,
          "aliases": [{"vendor_id": str(VENDOR["_id"]), "part_number": "KIT BS F274", "part_name": "Chain Kit TVS XL 100CC HD Mod"}]}
GRIP   = {"_id": ObjectId(), "name": "Map Grip Cover", "part_number": "MM-0102", "purchase_price": 30, "stock": 5}
FILTER = {"_id": ObjectId(), "name": "Map Air Filter", "part_number": "MM-0103", "purchase_price": 60}


def line(desc, pn, qty, unit, mrp, disc, price, amount, hsn="84213100"):
    return {"description": desc, "part_number": pn, "hsn": hsn, "qty": qty, "unit": unit, "mrp": mrp,
            "discount_pct": disc, "unit_price": price, "gst_pct": 18, "amount": amount}


BILL = {
    "vendor_name": "MOKSH AUTO POINT", "vendor_gstin": "29abnfm7338r1z3",
    "bill_number": "E437", "bill_date": "2026-08-26", "other_charges": 102, "grand_total": 13870,
    "items": [
        line("ASK WEGO WHITE", "NA-00023", 10, "PCS", 200, 32, 115.25, 1360, "87149400"),
        line("Chain Kit TVS XL 100CC HD Mod", "KIT BS F274", 1, "SET", 930, 28, 567.46, 669.60, "87141090"),
        line("Map Grip Cover", "", 20, "SET", 40, 0, 33.90, 800, "87141090"),
        line("Map Air Filter", "", 2, "PCS", 75, 0, 63.56, 150),
        line("Map Air Filter", "", 10, "PCS", 65, 0, 0, 650),   # price unreadable → from amount
    ],
}


def parse(monkeypatch, bill=BILL, vendors=(VENDOR,), head=b"%PDF-1.4 fake"):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setattr(server, "db", _DB(list(vendors), [CHAIN, GRIP, FILTER]))
    async def fake_extract(data, ctype):
        assert ctype == "application/pdf"
        return bill
    monkeypatch.setattr(server, "_extract_bill", fake_extract)
    up = UploadFile(file=io.BytesIO(head), filename="bill.pdf")
    return asyncio.run(server.parse_purchase_bill(up, current_user={"username": "t"}))


def test_header_and_vendor_by_gstin(monkeypatch):
    d = parse(monkeypatch)
    assert d["vendor_id"] == str(VENDOR["_id"])
    assert d["bill_number"] == "E437" and d["bill_date"] == "26 Aug 2026"
    assert d["round_off"] == 102 and d["grand_total"] == 13870


def test_part_matching(monkeypatch):
    items = parse(monkeypatch)["items"]
    wego, chain, grip, f1, f2 = items
    assert wego["part_id"] is None and wego["part_name"] == "ASK WEGO WHITE"     # new part
    assert chain["part_id"] == str(CHAIN["_id"])                                 # vendor's SKU alias
    assert chain["part_name"] == "Chain Kit TVS XL" and chain["_existing_rate"] == 560
    assert grip["part_id"] == str(GRIP["_id"])                                   # unique name
    # Same name on two lines with different MRPs: never auto-linked to one part
    assert f1["part_id"] is None and f2["part_id"] is None


def test_rates_reproduce_the_bill_amounts(monkeypatch):
    items = parse(monkeypatch)["items"]
    assert all(i["discount_pct"] == 0 for i in items)
    assert items[0]["rate"] == 115.25
    assert items[4]["rate"] == round(650 / 10 / 1.18, 2)     # 55.08, as printed on the bill
    for i, src in zip(items, BILL["items"]):
        assert abs(i["qty"] * i["rate"] * 1.18 - src["amount"]) < 1


def test_unknown_vendor_is_left_for_the_user(monkeypatch):
    d = parse(monkeypatch, vendors=())
    assert d["vendor_id"] is None and d["vendor_gstin"] == "29ABNFM7338R1Z3"
    # Vendor SKUs are per-vendor aliases, so with no vendor they can't link anything
    assert d["items"][1]["part_id"] is None
    assert d["items"][2]["part_id"] == str(GRIP["_id"])      # plain name still matches
