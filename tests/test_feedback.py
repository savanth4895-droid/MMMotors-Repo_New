# Customer feedback: a delivered job gets one stable token, the public form never
# exposes the customer's mobile, and each token accepts exactly one rating.
# Stub DB — no MongoDB needed.
import asyncio
import os
import sys

import pytest
from bson import ObjectId
from fastapi import HTTPException
from pydantic import ValidationError

os.environ.setdefault("JWT_SECRET_KEY", "test-only-secret")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server  # noqa: E402


def _match(doc, query):
    for k, v in query.items():
        if isinstance(v, dict) and "$exists" in v:
            if (k in doc) != v["$exists"]:
                return False
        elif doc.get(k) != v:
            return False
    return True


class _Jobs:
    def __init__(self, docs): self.docs = docs
    async def find_one(self, query, projection=None):
        return next((d for d in self.docs if _match(d, query)), None)
    async def update_one(self, query, update):
        doc = await self.find_one(query)
        if doc:
            doc.update(update["$set"])
        return type("R", (), {"matched_count": int(doc is not None)})()
    async def count_documents(self, query, limit=0):
        return sum(_match(d, query) for d in self.docs)


class _DB:
    def __init__(self, docs): self.service_jobs = _Jobs(docs)


@pytest.fixture
def job(monkeypatch):
    doc = {"_id": ObjectId(), "customer_name": "Ravi Kumar", "customer_mobile": "9876543210",
           "brand": "HONDA", "model": "Shine", "vehicle_number": "KA07U3915", "status": "delivered"}
    monkeypatch.setattr(server, "db", _DB([doc]))
    return doc


def run(coro): return asyncio.run(coro)


def test_token_is_stable(job):
    t1 = run(server._ensure_feedback_token(str(job["_id"])))
    t2 = run(server._ensure_feedback_token(str(job["_id"])))
    assert t1 == t2 and len(t1) >= 32


def test_form_hides_mobile_and_submits_once(job):
    token = run(server._ensure_feedback_token(str(job["_id"])))
    form = run(server.get_feedback_form(token))
    assert form == {"customer_name": "Ravi", "vehicle": "HONDA Shine",
                    "vehicle_number": "KA07U3915", "submitted": False}

    run(server.submit_feedback(token, server.FeedbackSubmit(rating=4, comment=" good ")))
    assert job["feedback_rating"] == 4 and job["feedback_comment"] == "good"
    assert run(server.get_feedback_form(token))["submitted"] is True

    with pytest.raises(HTTPException) as e:
        run(server.submit_feedback(token, server.FeedbackSubmit(rating=1)))
    assert e.value.status_code == 409 and job["feedback_rating"] == 4


def test_unknown_token(job):
    for call in (server.get_feedback_form("nope"),
                 server.submit_feedback("nope", server.FeedbackSubmit(rating=5))):
        with pytest.raises(HTTPException) as e:
            run(call)
        assert e.value.status_code == 404


@pytest.mark.parametrize("rating", [0, 6])
def test_rating_range(rating):
    with pytest.raises(ValidationError):
        server.FeedbackSubmit(rating=rating)
