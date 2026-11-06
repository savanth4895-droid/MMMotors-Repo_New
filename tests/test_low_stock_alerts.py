# _priority_low_alerts decides when a bill raises a low-stock alert. The rule is
# "crossed with THIS bill": above the reorder level before, at or below it now.
# Getting <= vs < wrong here means either silence or an alert on every later bill,
# so the arithmetic is pinned with a stub DB — no MongoDB needed.
import asyncio
import os
import sys

import pytest

os.environ.setdefault("JWT_SECRET_KEY", "test-only-secret")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server  # noqa: E402


class _Cursor:
    def __init__(self, docs): self._docs = docs
    async def to_list(self, _n): return self._docs


class _Parts:
    """Honours the two things the real query does: restrict to the touched ids,
    and to priority parts only."""
    def __init__(self, docs): self._docs = docs
    def find(self, query, _projection=None):
        ids = set(query["_id"]["$in"])
        return _Cursor([d for d in self._docs if d["_id"] in ids and d.get("priority")])


class _DB:
    def __init__(self, docs): self.spare_parts = _Parts(docs)


def run(docs, touched):
    original = server.db
    server.db = _DB(docs)
    try:
        return asyncio.run(server._priority_low_alerts(touched))
    finally:
        server.db = original


def part(_id, stock, level=5, priority=True):
    return {"_id": _id, "stock": stock, "reorder_level": level, "priority": priority,
            "name": f"part-{_id}", "part_number": f"PT-{_id}"}


def test_crossing_raises_one_alert():
    # Was 7, used 3, now 4 — dropped past a level of 5.
    alerts = run([part(1, stock=4)], {1: 3})
    assert len(alerts) == 1
    assert alerts[0] == {"part_number": "PT-1", "name": "part-1", "stock": 4, "reorder_level": 5}


def test_landing_exactly_on_the_level_alerts():
    # Was 6, used 1, now 5. "At or below" counts as needing an order.
    assert len(run([part(1, stock=5)], {1: 1})) == 1


def test_already_low_does_not_alert_again():
    # Was 4, used 1, now 3 — never above the level, so this bill did not cross it.
    # Without this, every later bill would re-alert and the alerts become noise.
    assert run([part(1, stock=3)], {1: 1}) == []


def test_running_out_alerts_even_when_already_low():
    # Was 1, used 1, now 0. No crossing of the level, but out of stock is a new and
    # worse state — the next customer cannot be served — and it only happens once.
    assert len(run([part(1, stock=0)], {1: 1})) == 1


def test_still_above_the_level_does_not_alert():
    # Was 12, used 2, now 10 — plenty left.
    assert run([part(1, stock=10)], {1: 2}) == []


def test_non_priority_part_is_ignored():
    assert run([part(1, stock=1, priority=False)], {1: 5}) == []


def test_zero_reorder_level_alerts_only_at_zero_stock():
    assert run([part(1, stock=1, level=0)], {1: 1}) == []
    assert len(run([part(1, stock=0, level=0)], {1: 1})) == 1


def test_only_the_crossing_parts_of_a_mixed_bill():
    docs = [part(1, stock=4), part(2, stock=20), part(3, stock=2, priority=False)]
    alerts = run(docs, {1: 3, 2: 2, 3: 9})
    assert [a["part_number"] for a in alerts] == ["PT-1"]


def test_nothing_touched_skips_the_query():
    # Must not hit the DB at all; the stub would raise a KeyError on an empty query.
    assert run([], {}) == []


@pytest.mark.parametrize("stock,level,qty,expected", [
    (0, 5, 1, 1),    # ran out completely, from 1
    (5, 5, 5, 1),    # 10 -> 5
    (6, 5, 1, 0),    # 7 -> 6, still above
    (5, 5, 0, 0),    # nothing deducted, so nothing crossed
])
def test_boundaries(stock, level, qty, expected):
    assert len(run([part(1, stock=stock, level=level)], {1: qty})) == expected
