"""The shared-plans mock on a real database: it never loads the demo dataset, and
only the seeded demo account gets a plan (04 §6a, 11 §2.6)."""

from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from notifications.models import Reminder
from subscriptions.models import FxRate, ServiceCatalogEntry, Subscription
from subscriptions.seed import ALEX, ensure_system_categories

PLANS = "/api/v1/shared-plans"
PLAN = "6a0b00000000000000000001"
REMIND = f"{PLANS}/{PLAN}/payments/6a0b00000000000000000023/remind"
REAL_EUR = Decimal("0.89477")


@pytest.fixture
def fresh(db):
    """A production-like database: categories and a real rate, and no demo data."""
    ensure_system_categories()
    FxRate.objects.create(currency="EUR", rate=REAL_EUR, as_of=timezone.now())


def signed_in(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def real_user(fresh):
    return User.objects.create_user(email="real.user@example.org", password="longenough1")


def test_a_real_user_on_a_fresh_database_gets_an_empty_list(real_user, contract):
    response = signed_in(real_user).get(PLANS)

    assert response.status_code == 200
    assert contract(response, "/shared-plans") == {
        "display_currency": "USD",
        "outstanding": {"amount": "0.00", "currency": "USD"},
        "results": [],
    }


def test_no_shared_plan_call_creates_anything_or_touches_the_rates(real_user):
    client = signed_in(real_user)
    catalog = ServiceCatalogEntry.objects.count()

    client.get(PLANS)
    client.post(
        PLANS,
        {"subscription_id": "6a0000000000000000000000", "participants": [{"display_name": "A"}]},
        format="json",
    )
    client.post(REMIND)

    assert list(User.objects.values_list("email", flat=True)) == [real_user.email]
    assert Subscription.all_objects.count() == 0
    assert Reminder.objects.count() == 0
    assert ServiceCatalogEntry.objects.count() == catalog
    assert FxRate.objects.get(currency="EUR").rate == REAL_EUR


def test_a_real_users_plan_is_not_alexs(api, alex, categories):
    someone = User.objects.create_user(email="real.user@example.org", password="longenough1")

    assert api.get(PLANS).json()["results"]
    assert signed_in(someone).get(PLANS).json()["results"] == []


def test_a_real_user_cannot_create_a_plan_yet(real_user, contract):
    response = signed_in(real_user).post(
        PLANS,
        {"subscription_id": "6a0000000000000000000000", "participants": [{"display_name": "A"}]},
        format="json",
    )

    assert response.status_code == 404
    assert contract(response, "/shared-plans")["error"]["code"] == "shared_plans_unavailable"


def test_a_real_user_cannot_remind_on_alexs_plan(api, alex, categories):
    someone = User.objects.create_user(email="real.user@example.org", password="longenough1")

    assert signed_in(someone).post(REMIND).status_code == 404


def test_someone_registering_the_demo_address_gets_no_plan_and_no_error(fresh):
    # Nothing stops this on a database that was never seeded.
    user = User.objects.create_user(email=ALEX.email, password="longenough1")

    response = signed_in(user).get(PLANS)

    assert response.status_code == 200
    assert response.json()["results"] == []
    assert Subscription.all_objects.count() == 0


def test_the_demo_account_still_gets_its_plan(api, contract):
    body = contract(api.get(PLANS), "/shared-plans")

    assert [plan["name"] for plan in body["results"]] == ["Netflix"]
    assert body["outstanding"] == {"amount": "5.16", "currency": "USD"}
