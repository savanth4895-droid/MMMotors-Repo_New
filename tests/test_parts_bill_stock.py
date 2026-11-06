# Parts-bill stock must be all-or-nothing: a shortage on any line leaves every part's stock unchanged.
# Needs a MongoDB replica set (transactions), e.g. a throwaway Atlas database:
#   TEST_MONGO_URL="mongodb+srv://..." pytest tests/
# Uses and then drops the database "mmmotors_test".
import asyncio
import json
import os
import sys

import pytest

TEST_MONGO_URL = os.getenv("TEST_MONGO_URL")
if not TEST_MONGO_URL:
    pytest.skip("TEST_MONGO_URL not set (needs a MongoDB replica set)", allow_module_level=True)

os.environ.setdefault("JWT_SECRET_KEY", "test-only-secret")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import certifi                                           # noqa: E402
from fastapi import HTTPException                       # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient     # noqa: E402

import database as _db                                   # noqa: E402
import server                                            # noqa: E402

TEST_DB = "mmmotors_test"


def _item(part_number, qty):
    return server.PartsBillItem(part_number=part_number, name=part_number, qty=qty, unit_price=100)


async def _stock(db, part_number):
    return (await db.spare_parts.find_one({"part_number": part_number}))["stock"]


def test_short_parts_bill_changes_no_stock():
    async def run():
        tls = TEST_MONGO_URL.startswith("mongodb+srv://")
        client = AsyncIOMotorClient(TEST_MONGO_URL, tlsCAFile=certifi.where() if tls else None)
        await client.drop_database(TEST_DB)
        db = client[TEST_DB]
        _db.client, _db.db, server.db = client, db, db
        user = {"name": "test"}
        try:
            await db.spare_parts.insert_many([
                {"part_number": "A", "name": "A", "stock": 5},
                {"part_number": "B", "name": "B", "stock": 0},
            ])

            # Create: line A fits, line B is short -> 409, A untouched, no bill saved.
            with pytest.raises(HTTPException) as err:
                await server.create_parts_bill(server.PartsBillCreate(items=[_item("A", 2), _item("B", 1)]), current_user=user)
            assert err.value.status_code == 409
            assert await _stock(db, "A") == 5
            assert await db.parts_bills.count_documents({}) == 0

            # A good bill deducts normally.
            await server.create_parts_bill(server.PartsBillCreate(items=[_item("A", 2)]), current_user=user)
            assert await _stock(db, "A") == 3
            bill = await db.parts_bills.find_one({})

            # Edit to a short item list -> 409, the restore of A is rolled back, bill unchanged.
            with pytest.raises(HTTPException) as err:
                await server.update_parts_bill(str(bill["_id"]), server.PartsBillUpdate(items=[_item("A", 1), _item("B", 1)]), current_user=user)
            assert err.value.status_code == 409
            assert await _stock(db, "A") == 3
            assert (await db.parts_bills.find_one({"_id": bill["_id"]}))["items"][0]["qty"] == 2

            # A good edit restores the old qty and deducts the new one.
            await server.update_parts_bill(str(bill["_id"]), server.PartsBillUpdate(items=[_item("A", 1)]), current_user=user)
            assert await _stock(db, "A") == 4
        finally:
            await client.drop_database(TEST_DB)
            client.close()

    asyncio.run(run())


def test_sale_fittings_end_to_end():
    """A bike sale deducts its fittings, flags what was short, completes the deduction
    when marked fitted, and puts everything back if the sale is deleted."""
    async def run():
        tls = TEST_MONGO_URL.startswith("mongodb+srv://")
        client = AsyncIOMotorClient(TEST_MONGO_URL, tlsCAFile=certifi.where() if tls else None)
        await client.drop_database(TEST_DB)
        db = client[TEST_DB]
        _db.client, _db.db, server.db = client, db, db
        user = {"name": "test"}
        try:
            await db.spare_parts.insert_many([
                {"part_number": "TANK", "name": "Tank cover", "stock": 5, "reorder_level": 2,
                 "priority": True, "fitting_brands": ["HERO"], "fitting_qty": 1, "selling_price": 300},
                {"part_number": "GRILL", "name": "Grill", "stock": 0, "reorder_level": 2,
                 "fitting_brands": ["HERO"], "fitting_qty": 1, "selling_price": 450},
            ])
            cust = await db.customers.insert_one({"name": "A", "mobile": "9000000000"})
            veh  = await db.vehicles.insert_one({"brand": "HERO", "model": "Splendor", "status": "in_stock"})

            # The brand's standard set is what the sale form pre-fills.
            standard = await server.standard_fittings(brand="hero", current_user=user)
            assert {p["part_number"] for p in standard} == {"TANK", "GRILL"}

            sale = await server.create_sale(server.SaleCreate(
                customer_id=str(cust.inserted_id), vehicle_id=str(veh.inserted_id), sale_price=80000,
                fittings=[server.SaleFitting(part_number="TANK", name="Tank cover", qty=1, unit_price=300),
                          server.SaleFitting(part_number="GRILL", name="Grill", qty=1, unit_price=450)],
            ), current_user=user)

            # In stock: deducted. Out of stock: bike still sold, shortfall flagged.
            assert (await db.spare_parts.find_one({"part_number": "TANK"}))["stock"] == 4
            assert (await db.spare_parts.find_one({"part_number": "GRILL"}))["stock"] == 0
            assert [p["part_number"] for p in sale["pending_fittings"]] == ["GRILL"]
            # TANK went 5 -> 4 against a reorder level of 2, so no alert yet.
            assert sale["low_stock_alerts"] == []

            # Stock arrives, then the fitting is done: the deduction completes.
            await server.adjust_stock_by_number("GRILL", server.StockAdjust(qty=3, action="add"), current_user=user)
            after = await server.mark_fittings_fitted(sale["id"], server.FittingsFittedUpdate(), current_user=user)
            assert after["pending_fittings"] == []
            assert (await db.spare_parts.find_one({"part_number": "GRILL"}))["stock"] == 2

            # Deleting the sale puts back exactly what was taken, no more.
            await server.delete_sale(sale["id"], current_user=user)
            assert (await db.spare_parts.find_one({"part_number": "TANK"}))["stock"] == 5
            assert (await db.spare_parts.find_one({"part_number": "GRILL"}))["stock"] == 3
            assert (await db.vehicles.find_one({"_id": veh.inserted_id}))["status"] == "in_stock"
        finally:
            await client.drop_database(TEST_DB)
            client.close()

    asyncio.run(run())


def test_priority_alerts_and_ordered_flag():
    """The alert wiring end to end: only a priority part that crossed its level comes
    back on the bill response, and marking it ordered never touches reorder_level."""
    async def run():
        tls = TEST_MONGO_URL.startswith("mongodb+srv://")
        client = AsyncIOMotorClient(TEST_MONGO_URL, tlsCAFile=certifi.where() if tls else None)
        await client.drop_database(TEST_DB)
        db = client[TEST_DB]
        _db.client, _db.db, server.db = client, db, db
        user = {"name": "test"}
        try:
            await db.spare_parts.insert_many([
                {"part_number": "P", "name": "Priority part", "stock": 7, "reorder_level": 5, "priority": True},
                {"part_number": "N", "name": "Normal part",   "stock": 7, "reorder_level": 5, "priority": False},
            ])

            # Both cross their level, but only the priority one is reported.
            res = await server.create_parts_bill(
                server.PartsBillCreate(items=[_item("P", 3), _item("N", 3)]), current_user=user)
            alerts = json.loads(bytes(res.body))["low_stock_alerts"]
            assert [a["part_number"] for a in alerts] == ["P"]
            assert alerts[0]["stock"] == 4

            # Already low: a second bill must not repeat the alert.
            res = await server.create_parts_bill(server.PartsBillCreate(items=[_item("P", 1)]), current_user=user)
            assert json.loads(bytes(res.body))["low_stock_alerts"] == []

            # Marking it ordered stamps a date and leaves reorder_level alone, so the
            # part stays visible to every future low-stock check.
            p = await db.spare_parts.find_one({"part_number": "P"})
            await server.mark_part_ordered(str(p["_id"]), server.PartOrderedUpdate(ordered=True), current_user=user)
            p = await db.spare_parts.find_one({"part_number": "P"})
            assert p["ordered_at"] and p["reorder_level"] == 5

            # Stock arriving clears the flag.
            await server.adjust_stock_by_number("P", server.StockAdjust(qty=20, action="add"), current_user=user)
            p = await db.spare_parts.find_one({"part_number": "P"})
            assert "ordered_at" not in p
        finally:
            await client.drop_database(TEST_DB)
            client.close()

    asyncio.run(run())
