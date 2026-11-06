# Google Sheet mapping. These columns are read by a human against 690 existing rows, so
# the formats have to match what is already in the sheet: dates as "3-Nov-2026", brand
# uppercase, finance as "Cash" or the financier's name. Pure functions, no DB, no network.
import os
import sys

import pytest

os.environ.setdefault("JWT_SECRET_KEY", "test-only-secret")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server  # noqa: E402


# ── Dates ──────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("raw,expected", [
    ("2026-11-03",  "3-Nov-2026"),   # ISO, what the sale form sends
    ("03 Nov 2026", "3-Nov-2026"),   # legacy format on older sale records
    ("1-Jul-2024",  "1-Jul-2024"),   # already in the sheet's own format
    ("2026-01-09",  "9-Jan-2026"),   # no zero padding, matching the sheet
])
def test_date_formats_all_land_on_the_sheet_format(raw, expected):
    assert server._sheet_date(raw) == expected


def test_blank_date_stays_blank():
    assert server._sheet_date("") == ""
    assert server._sheet_date(None) == ""


def test_unparseable_date_is_passed_through_not_dropped():
    # Better a visibly odd cell than a silently empty one.
    assert server._sheet_date("sometime in July") == "sometime in July"


# ── Column mapping ─────────────────────────────────────────────────────────────
def sale(**over):
    base = {
        "sale_date": "2026-11-03", "customer_name": "Madhava Singh", "care_of": "S/O Raghunath",
        "customer_mobile": "9902560268", "customer_address": "Malur",
        "vehicle_brand": "hero", "vehicle_model": "Splendor", "vehicle_color": "Red",
        "vehicle_number": "KA53HX7796", "chassis_number": "MD625BK", "engine_number": "BK2ER",
        "hsrp_front": "", "hsrp_back": "",
        "finance_type": "cash", "financier": "",
        "nominee": {"name": "Archana", "relation": "Wife", "age": 30},
        "milestones": {}, "milestone_dates": {},
    }
    base.update(over)
    return base


def test_direct_columns():
    c = server._sheet_cells(sale())
    assert c["B"] == "3-Nov-2026"
    assert c["C"] == "Madhava Singh" and c["D"] == "S/O Raghunath"
    assert c["E"] == "9902560268" and c["F"] == "Malur"
    assert c["H"] == "Splendor" and c["I"] == "Red"
    assert c["J"] == "KA53HX7796" and c["K"] == "MD625BK" and c["L"] == "BK2ER"


def test_brand_is_uppercased_to_match_column_g():
    assert server._sheet_cells(sale(vehicle_brand="hero"))["G"] == "HERO"
    assert server._sheet_cells(sale(vehicle_brand="Royal Enfield"))["G"] == "ROYAL ENFIELD"


def test_finance_column_is_cash_or_the_financier_name():
    assert server._sheet_cells(sale(finance_type="cash"))["S"] == "Cash"
    assert server._sheet_cells(sale(finance_type="", financier=""))["S"] == "Cash"
    assert server._sheet_cells(sale(finance_type="finance", financier="L&T"))["S"] == "L&T"
    # Finance chosen but no financier typed: show the type rather than a blank cell.
    assert server._sheet_cells(sale(finance_type="finance", financier=""))["S"] == "finance"


def test_number_plate_column_follows_the_milestone():
    assert server._sheet_cells(sale())["P"] == "Not Issued"
    c = server._sheet_cells(sale(milestones={"number_plate": True},
                                 milestone_dates={"number_plate": "2026-10-02"}))
    assert c["P"] == "Issued" and c["Q"] == "2-Oct-2026"


def test_nominee_age_is_sent_as_text():
    c = server._sheet_cells(sale())
    assert c["T"] == "Archana" and c["U"] == "Wife" and c["V"] == "30"
    assert server._sheet_cells(sale(nominee={}))["V"] == "", "no nominee must not write '0'"


def test_missing_fields_become_blanks_never_none():
    # A None would tell the Apps Script to leave the cell alone, which on an edit would
    # keep a stale value instead of clearing it.
    c = server._sheet_cells({})
    assert all(v is not None for v in c.values())
    assert c["C"] == "" and c["G"] == "" and c["P"] == "Not Issued"


def test_owner_managed_columns_are_never_written():
    # A (brand/salesperson), O (RTO Done), R (Page Number) and the unused insurance /
    # EMI / LAN / UTR block are filled by hand — the app must not touch them.
    written = set(server._sheet_cells(sale()))
    assert written.isdisjoint({"A", "O", "R", "W", "X", "Y", "Z", "AA", "AB", "AC", "AD"})


def test_mapping_covers_every_column_the_app_owns():
    assert set(server._sheet_cells(sale())) == {
        "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "P", "Q", "S", "T", "U", "V",
    }


# ── Safety ─────────────────────────────────────────────────────────────────────
def test_sync_is_a_no_op_when_not_configured(monkeypatch):
    """An install with no sheet set up must not attempt a call or stamp an error on the
    sale — otherwise every sale would show the 'not in sheet' marker."""
    import asyncio
    monkeypatch.setattr(server, "SHEETS_WEBHOOK_URL", "")
    monkeypatch.setattr(server, "SHEETS_WEBHOOK_SECRET", "")

    def explode(*_a, **_k):
        raise AssertionError("must not post when the sheet is not configured")
    monkeypatch.setattr(server, "_sheet_post", explode)

    result = asyncio.run(server._sheet_sync(sale()))
    assert result["skipped"] == "not configured"


def test_a_failing_sheet_never_raises(monkeypatch):
    """The sale is already committed by this point. A sheet outage must not surface as a
    500 to the salesperson; it has to come back as a recorded failure."""
    import asyncio
    monkeypatch.setattr(server, "SHEETS_WEBHOOK_URL", "https://example.invalid/exec")
    monkeypatch.setattr(server, "SHEETS_WEBHOOK_SECRET", "s3cret")

    def boom(*_a, **_k):
        raise TimeoutError("Google is down")
    monkeypatch.setattr(server, "_sheet_post", boom)

    result = asyncio.run(server._sheet_sync(sale()))   # no _id, so no DB write attempted
    assert result["ok"] is False
    assert "TimeoutError" in result["error"]


def test_the_secret_is_sent_and_delete_sends_no_cells(monkeypatch):
    import asyncio
    sent = {}
    monkeypatch.setattr(server, "SHEETS_WEBHOOK_URL", "https://example.invalid/exec")
    monkeypatch.setattr(server, "SHEETS_WEBHOOK_SECRET", "s3cret")
    monkeypatch.setattr(server, "_sheet_post", lambda payload: sent.update(payload) or {"ok": True})

    asyncio.run(server._sheet_sync(sale(chassis_number="MD625BK"), action="delete"))
    assert sent["secret"] == "s3cret"
    assert sent["action"] == "delete"
    assert sent["chassis"] == "MD625BK"
    assert "cells" not in sent, "a delete only needs the key to find the row"


# ── Replies ────────────────────────────────────────────────────────────────────
class _FakeResponse:
    def __init__(self, body):
        self._body = body.encode("utf-8")

    def read(self, _n=None):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *_a):
        return False


def _post_returning(monkeypatch, body):
    monkeypatch.setattr(server, "SHEETS_WEBHOOK_URL", "https://example.invalid/exec")
    monkeypatch.setattr(server.urllib.request, "urlopen",
                        lambda *_a, **_k: _FakeResponse(body))
    return server._sheet_post({"secret": "s", "action": "upsert", "cells": {}})


def test_the_health_reply_is_not_accepted_as_a_write(monkeypatch):
    """The /exec URL redirects to a script.googleusercontent.com/macros/echo address.
    Put that address in SHEETS_WEBHOOK_URL and every POST replays the doGet health JSON,
    which says ok:true. Counting that as success marks sales as synced while the sheet
    stays empty — the failure is invisible, which is the worst kind."""
    result = _post_returning(monkeypatch, '{"ok":true,"service":"MM Motors sheet sync"}')
    assert result["ok"] is False
    assert "/exec" in result["error"]


def test_a_real_write_is_accepted(monkeypatch):
    result = _post_returning(monkeypatch, '{"ok":true,"action":"appended","row":691}')
    assert result["ok"] is True and result["row"] == 691


def test_a_refusal_is_passed_through(monkeypatch):
    result = _post_returning(monkeypatch, '{"ok":false,"error":"bad secret"}')
    assert result["ok"] is False and result["error"] == "bad secret"


def test_an_html_login_page_is_an_error_not_a_crash(monkeypatch):
    result = _post_returning(monkeypatch, "<!DOCTYPE html><title>Sign in</title>")
    assert result["ok"] is False and "unexpected reply" in result["error"]
