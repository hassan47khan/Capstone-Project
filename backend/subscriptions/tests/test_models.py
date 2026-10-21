from datetime import date
from decimal import Decimal

import pytest
from bson import ObjectId
from django.db import connection

from accounts.models import User
from subscriptions.models import Participant, Sharing, Subscription


@pytest.fixture
def owner():
    return User.objects.create_user(email="owner@example.com", password="x")


@pytest.fixture
def required(categories):
    """The fields every subscription needs since handoff 04."""
    return {
        "billing_price": Decimal("9.99"),
        "start_date": date(2026, 1, 15),
        "category": categories["other"],
    }


@pytest.mark.django_db
def test_embedded_model_round_trips(owner, required):
    claimed_by = ObjectId()
    Subscription.objects.create(
        owner=owner,
        name="Streaming Plus",
        **required,
        sharing=Sharing(
            split_method="equal",
            participants=[
                Participant(email="sam@example.com"),
                Participant(email="alex@example.com", user_id=claimed_by),
            ],
        ),
    )

    loaded = Subscription.objects.get(owner=owner)

    assert loaded.sharing.split_method == "equal"
    assert [p.email for p in loaded.sharing.participants] == [
        "sam@example.com",
        "alex@example.com",
    ]
    assert loaded.sharing.participants[0].user_id is None
    assert loaded.sharing.participants[1].user_id == claimed_by


@pytest.mark.django_db
def test_embedded_model_is_stored_inside_the_parent_document(owner, required):
    sub = Subscription.objects.create(
        owner=owner,
        name="Gym",
        sharing=Sharing(participants=[Participant(email="a@b.co")]),
        **required,
    )

    raw = connection.get_collection("subscriptions").find_one({"_id": sub.pk})

    # Embedding means one document, not a join: the participant lives inside it.
    assert raw["sharing"]["participants"][0]["email"] == "a@b.co"
    assert raw["owner_id"] == owner.pk


@pytest.mark.django_db
def test_subscriptions_can_be_found_by_participant_email(owner, required):
    Subscription.objects.create(
        owner=owner,
        name="Shared",
        sharing=Sharing(participants=[Participant(email="sam@x.io")]),
        **required,
    )
    Subscription.objects.create(owner=owner, name="Solo", sharing=Sharing(), **required)

    found = Subscription.objects.filter(sharing__participants__email="sam@x.io")

    assert [s.name for s in found] == ["Shared"]


@pytest.mark.django_db
def test_embedded_index_exists_in_mongodb():
    # Asks MongoDB itself, not Django's model state, so this fails if the
    # EmbeddedFieldIndex never reached the database.
    indexes = connection.get_collection("subscriptions").index_information()
    keys = [index["key"] for index in indexes.values()]

    assert [("sharing.participants.email", 1)] in keys


@pytest.mark.django_db
def test_billing_price_is_stored_as_decimal128_and_round_trips_exactly(owner, required):
    # The Decimal storage decision in CLAUDE.md: BSON Decimal128, never a float.
    from bson.decimal128 import Decimal128

    sub = Subscription.objects.create(
        owner=owner, name="Cents", **{**required, "billing_price": Decimal("13.99")}
    )

    raw = connection.get_collection("subscriptions").find_one({"_id": sub.pk})
    loaded = Subscription.objects.get(pk=sub.pk)

    assert isinstance(raw["billing_price"], Decimal128)
    assert raw["billing_price"].to_decimal() == Decimal("13.99")
    assert loaded.billing_price == Decimal("13.99")
    assert isinstance(loaded.billing_price, Decimal)
    # 0.1 + 0.2 is the classic float failure; Decimal128 keeps it exact.
    assert loaded.billing_price + Decimal("0.1") + Decimal("0.2") == Decimal("14.29")
