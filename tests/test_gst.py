# GST maths for bills. Prices are GST-inclusive; tax is back-calculated and split CGST/SGST.
#   pytest tests/
import os
import sys

import pytest

os.environ.setdefault("JWT_SECRET_KEY", "test-only-secret")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import calc_bill_totals, calc_gst_line  # noqa: E402


def test_inclusive_price_back_calculates_tax():
    line = calc_gst_line(118, 1, 18)
    assert line == {"gross": 118, "discount": 0.0, "taxable": 100.0, "cgst": 9.0, "sgst": 9.0, "gst_total": 18.0, "total": 118.0}


def test_qty_and_line_discount():
    line = calc_gst_line(118, 3, 18, discount=54)  # 354 gross, 300 after discount
    assert line["gross"] == 354
    assert line["total"] == 300
    assert line["taxable"] == round(300 / 1.18, 2)


def test_discount_is_clamped_to_gross():
    line = calc_gst_line(118, 1, 18, discount=500)
    assert line["discount"] == 118
    assert line["total"] == 0 and line["gst_total"] == 0


def test_zero_rate_has_no_tax():
    line = calc_gst_line(250, 2, 0)
    assert line["taxable"] == 500 and line["gst_total"] == 0


def test_bill_totals_group_by_slab():
    totals = calc_bill_totals([
        {"unit_price": 118, "qty": 1, "gst_rate": 18},
        {"unit_price": 105, "qty": 2, "gst_rate": 5},
    ])
    assert totals["subtotal"] == 300
    assert totals["gst_total"] == 28
    assert totals["grand_total"] == 328
    assert totals["gst_breakup"] == {
        "18": {"taxable": 100.0, "cgst": 9.0, "sgst": 9.0},
        "5":  {"taxable": 200.0, "cgst": 5.0, "sgst": 5.0},
    }


@pytest.mark.xfail(strict=True, reason="known: CGST and SGST are each rounded from half the tax, so they can sum "
                                       "to 1 paisa less than gst_total (e.g. Rs 1 at 18%). Fix needs an accountant's call.")
def test_cgst_plus_sgst_equals_total_tax():
    for price in range(1, 2000):
        line = calc_gst_line(price, 1, 18)
        assert round(line["cgst"] + line["sgst"], 2) == line["gst_total"], price
