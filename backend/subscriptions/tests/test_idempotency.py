"""POST /subscriptions with an Idempotency-Key (system design spec, data
integrity practices): a retry gets the subscription the first request made."""

from datetime import timedelta

import pytest
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from subscriptions import idempotency
from subscriptions.models import IdempotencyKey, PriceHistoryEvent, Subscription

FIGMA = {
    "name": "Figma",
    "billing_price": "15.00",
    "start_date": "2026-09-20",
    "category": "productivity",
}


def create(client, key=None, data=None):
    headers = {} if key is None else {"HTTP_IDEMPOTENCY_KEY": key}
    return client.post("/api/v1/subscriptions", data or FIGMA, format="json", **headers)


def figmas(owner):
    return Subscription.all_objects.filter(owner=owner, name="Figma")


@pytest.fixture
def sam(categories):
    client = APIClient()
    client.force_authenticate(User.objects.create_user(email="idem@example.com", password="x"))
    return client


def test_a_retry_with_the_same_key_gets_the_same_subscription(api, alex, contract):
    first = create(api, "k-1")
    retry = create(api, "k-1")

    assert first.status_code == retry.status_code == 201
    assert contract(retry, "/subscriptions") == first.json()
    sub = figmas(alex).get()
    assert PriceHistoryEvent.objects.filter(subscription=sub).count() == 1


def test_the_same_body_in_another_key_order_is_still_a_repeat(api, alex):
    create(api, "k-1")

    retry = create(api, "k-1", dict(reversed(list(FIGMA.items()))))

    assert retry.status_code == 201
    assert figmas(alex).count() == 1


def test_a_reused_key_with_a_different_body_is_409(api, alex, contract):
    create(api, "k-1")

    response = create(api, "k-1", {**FIGMA, "billing_price": "16.00"})

    assert response.status_code == 409
    assert contract(response, "/subscriptions")["error"] == {
        "code": "idempotency_key_reused",
        "message": "This Idempotency-Key was already used for a different subscription.",
    }
    assert figmas(alex).count() == 1


def test_keys_are_per_user(api, alex, sam):
    create(api, "k-1")

    assert create(sam, "k-1").status_code == 201
    assert figmas(alex).count() == 1
    assert Subscription.objects.filter(name="Figma").count() == 2


def test_without_a_key_every_post_creates(api, alex):
    create(api)
    create(api)

    assert figmas(alex).count() == 2
    assert not IdempotencyKey.objects.exists()


def test_a_parallel_request_that_lost_the_race_gets_the_winners_subscription(
    api, alex, monkeypatch
):
    winner = create(api, "k-1").json()
    # This request looked before the winner had recorded the key.
    real = idempotency.stored
    answers = iter([lambda *a: None])
    monkeypatch.setattr(idempotency, "stored", lambda *a: next(answers, real)(*a))

    response = create(api, "k-1")

    assert response.status_code == 201
    assert response.json()["id"] == winner["id"]
    assert figmas(alex).count() == 1  # the loser's create rolled back with its key


def test_an_expired_key_can_be_used_again(api, alex):
    create(api, "k-1")
    IdempotencyKey.objects.update(expires_at=timezone.now() - timedelta(seconds=1))

    assert create(api, "k-1", {**FIGMA, "billing_price": "16.00"}).status_code == 201
    assert figmas(alex).count() == 2


def test_a_key_lives_a_day(api):
    before = timezone.now()
    create(api, "k-1")

    record = IdempotencyKey.objects.get()
    assert (
        timedelta(hours=24)
        <= record.expires_at
        - before.replace(
            microsecond=before.microsecond // 1000 * 1000  # BSON keeps ms
        )
        < timedelta(hours=24, minutes=1)
    )


def test_mongodb_deletes_keys_past_expires_at(db):
    indexes = connection.get_collection("idempotency_keys").index_information()

    ttl = [i for i in indexes.values() if i["key"] == [("expires_at", 1)]]
    assert len(ttl) == 1 and ttl[0]["expireAfterSeconds"] == 0


@pytest.mark.parametrize("key", ["", "   ", "k" * 256])
def test_an_unusable_key_is_400(api, alex, contract, key):
    response = create(api, key)

    assert response.status_code == 400
    assert contract(response, "/subscriptions")["error"]["fields"] == {
        "Idempotency-Key": ["Send an Idempotency-Key of 1 to 255 characters, or none."]
    }
    assert not figmas(alex).exists()


def test_a_key_of_255_characters_is_fine(api):
    assert create(api, "k" * 255).status_code == 201
