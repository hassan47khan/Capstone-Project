"""Family plans (handoff 10). The seed's family: Alex (admin), Jordan (member,
$100 limit) and Sam (viewer, can't see the family total), 04 §4.5's figures."""

from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from accounts.models import User, settings_for
from family.models import Family, Membership
from subscriptions import seed
from subscriptions.models import SharedPlan, Subscription

FAMILY = "/api/v1/family"
SUBS = "/api/v1/subscriptions"


def usd(amount):
    return {"amount": amount, "currency": "USD"}


def signed_in(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def jordan(alex):
    return User.objects.get(email=seed.JORDAN.email)


@pytest.fixture
def sam(alex):
    return User.objects.get(email=seed.SAM.email)


@pytest.fixture
def loner(alex, categories):
    """Someone in no family, with one subscription."""
    user = User.objects.create_user(email="loner@example.com", name="Lee Loner", password="x")
    signed_in(user).post(SUBS, new_sub(), format="json")
    return user


def membership(user) -> Membership:
    return Membership.objects.get(user=user)


def member_url(user) -> str:
    return f"{FAMILY}/members/{membership(user).pk}"


def new_sub(**overrides):
    return {
        "name": "Crunchyroll",
        "billing_price": "7.99",
        "start_date": "2026-09-20",
        "category": "entertainment",
        **overrides,
    }


def by_name(body):
    return {m["name"]: m for m in body["members"]}


# The figures (10 §8) ----------------------------------------------------------------


def test_the_family_total_and_each_member_match_04_section_4_5(api, alex, contract):
    body = contract(api.get(FAMILY), "/family")

    assert body["total"] == usd("198.16")
    members = by_name(body)
    assert members["Alex Kim"]["total"] == usd("129.20")
    assert members["Jordan Doe"]["total"] == usd("45.98")
    assert members["Sam"]["total"] == usd("22.98")
    assert [m["role"] for m in body["members"]] == ["admin", "member", "viewer"]
    assert [m["subscription_count"] for m in body["members"]] == [8, 4, 2]
    assert (body["seats_used"], body["seat_limit"]) == (3, 5)
    assert body["you"] == {
        "membership_id": str(membership(alex).pk),
        "role": "admin",
        "may_add_subscriptions": True,
        "may_edit_subscriptions": True,
        "may_view_family_total": True,
    }


def test_member_rows_always_add_up_to_the_family_total(api):
    body = api.get(FAMILY).json()
    assert sum(Decimal(m["total"]["amount"]) for m in body["members"]) == Decimal(
        body["total"]["amount"]
    )


def test_jordans_limit_is_shown_and_he_is_under_it(api):
    jordan = by_name(api.get(FAMILY).json())["Jordan Doe"]
    assert jordan["spending_limit"] == usd("100.00")
    assert jordan["over_limit"] is False


def test_the_family_total_is_in_the_familys_currency_whoever_looks(api, jordan):
    settings = settings_for(jordan)
    settings.display_currency = "EUR"
    settings.save()
    family = Family.objects.get()
    family.display_currency = "EUR"
    family.save()

    body = signed_in(jordan).get(FAMILY).json()

    # 198.16 USD at 0.9177.
    assert body["total"] == {"amount": "181.85", "currency": "EUR"}
    assert body["display_currency"] == "EUR"


def test_a_viewer_without_the_total_sees_only_their_own(sam, contract):
    body = contract(signed_in(sam).get(FAMILY), "/family")

    assert body["total"] is None
    assert body["unconverted_count"] is None
    members = by_name(body)
    assert members["Sam"]["total"] == usd("22.98")
    assert members["Alex Kim"]["total"] is None
    assert members["Jordan Doe"]["total"] is None
    # Still a list of who is in it, with counts.
    assert members["Jordan Doe"]["subscription_count"] == 4
    assert body["you"]["may_view_family_total"] is False
    assert body["you"]["may_add_subscriptions"] is False


def test_cancelled_subscriptions_and_running_trials_stay_out_of_the_total(api, jordan):
    hulu = Subscription.objects.get(owner=jordan, name="Hulu")
    signed_in(jordan).post(f"{SUBS}/{hulu.pk}/cancel")

    body = api.get(FAMILY).json()
    assert by_name(body)["Jordan Doe"]["total"] == usd("27.99")
    assert body["total"] == usd("180.17")


def test_someone_in_no_family_gets_no_family(loner, contract):
    response = signed_in(loner).get(FAMILY)
    contract(response, "/family")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "no_family"


# Starting, changing and ending a family ------------------------------------------------


def test_starting_a_family_makes_you_its_admin(loner, contract):
    response = signed_in(loner).post(FAMILY, {"name": "  Loners  "}, format="json")
    body = contract(response, "/family")

    assert response.status_code == 201
    assert body["name"] == "Loners"
    assert body["you"]["role"] == "admin"
    assert [m["name"] for m in body["members"]] == ["Lee Loner"]
    assert body["total"] == usd("7.99")


def test_you_cant_start_a_second_family(api):
    response = api.post(FAMILY, {"name": "Another"}, format="json")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "already_in_family"


def test_a_family_needs_a_name(loner):
    response = signed_in(loner).post(FAMILY, {"name": "   "}, format="json")
    assert response.status_code == 400
    assert response.json()["error"]["fields"]["name"] == ["Name your family."]


def test_an_admin_changes_the_family_settings(api, contract):
    response = api.patch(
        FAMILY,
        {"fiscal_year_start": 7, "shared_timezone": "America/New_York", "display_currency": "EUR"},
        format="json",
    )
    body = contract(response, "/family")
    assert (body["fiscal_year_start"], body["shared_timezone"]) == (7, "America/New_York")
    assert body["total"]["currency"] == "EUR"


@pytest.mark.parametrize(
    ("field", "value"),
    [("fiscal_year_start", 13), ("shared_timezone", "Mars/Olympus"), ("display_currency", "XYZ")],
)
def test_bad_family_settings_are_400(api, field, value):
    response = api.patch(FAMILY, {field: value}, format="json")
    assert response.status_code == 400
    assert field in response.json()["error"]["fields"]


def test_ending_the_family_keeps_everyones_subscriptions(api, jordan):
    before = Subscription.objects.filter(owner=jordan).count()

    assert api.delete(FAMILY).status_code == 204

    assert not Family.objects.exists()
    assert not Membership.objects.exists()
    assert Subscription.objects.filter(owner=jordan).count() == before
    assert signed_in(jordan).get(FAMILY).status_code == 404


# Member detail (10 §3.4) and privacy (10 §2, option A) ---------------------------------


def test_member_detail_lists_jordans_four_subscriptions_adding_up_to_45_98(api, jordan, contract):
    body = contract(api.get(member_url(jordan)), "/family/members/{membership_id}")

    assert body["name"] == "Jordan Doe"
    assert body["role"] == "member"
    assert body["total"] == usd("45.98")
    assert body["spending_limit"] == usd("100.00")
    assert [s["name"] for s in body["subscriptions"]] == [
        "Hulu",
        "Notion",
        "Disney+",
        "GitHub Pro",
    ]
    assert sum(Decimal(s["monthly"]["amount"]) for s in body["subscriptions"]) == Decimal("45.98")
    assert (body["can_add_subscriptions"], body["can_edit_own_subs"]) == (True, True)


def test_a_private_subscription_counts_but_has_no_name_for_the_admin(api, jordan, contract):
    hulu = Subscription.objects.get(owner=jordan, name="Hulu")
    signed_in(jordan).patch(f"{SUBS}/{hulu.pk}", {"is_private": True}, format="json")

    body = contract(api.get(member_url(jordan)), "/family/members/{membership_id}")

    assert body["total"] == usd("45.98")
    private = body["subscriptions"][-1]
    assert private == {
        "id": None,
        "name": None,
        "is_private": True,
        "service_mark": None,
        "category": None,
        "next_bill_date": None,
        "billing_price": None,
        "monthly": usd("17.99"),
    }
    assert "Hulu" not in str(body)
    # The family total doesn't move.
    assert api.get(FAMILY).json()["total"] == usd("198.16")


def test_you_see_your_own_private_subscriptions_in_full(jordan):
    hulu = Subscription.objects.get(owner=jordan, name="Hulu")
    api = signed_in(jordan)
    api.patch(f"{SUBS}/{hulu.pk}", {"is_private": True}, format="json")

    rows = api.get(member_url(jordan)).json()["subscriptions"]

    assert {"name": "Hulu", "is_private": True} == {
        k: v for k, v in rows[0].items() if k in ("name", "is_private")
    }


def test_is_private_is_on_every_subscription_and_can_be_set_on_create(api, contract):
    response = api.post(SUBS, new_sub(is_private=True), format="json")
    assert contract(response, "/subscriptions")["is_private"] is True
    listed = api.get(SUBS).json()["results"]
    assert all("is_private" in row for row in listed)


def test_members_only_see_their_own_detail(jordan, sam):
    assert signed_in(jordan).get(member_url(sam)).status_code == 404
    assert signed_in(jordan).get(member_url(jordan)).status_code == 200


def test_another_familys_member_is_404(api, loner):
    signed_in(loner).post(FAMILY, {"name": "Loners"}, format="json")
    assert api.get(member_url(loner)).status_code == 404
    assert api.get(f"{FAMILY}/members/not-an-id").status_code == 404


# Roles and permissions -------------------------------------------------------------------


def test_an_admin_changes_a_role_permissions_and_limit(api, jordan, contract):
    response = api.patch(
        member_url(jordan),
        {"role": "viewer", "can_view_family_total": False, "spending_limit": "40.00"},
        format="json",
    )
    body = contract(response, "/family/members/{membership_id}")

    assert body["role"] == "viewer"
    assert body["can_view_family_total"] is False
    assert body["spending_limit"] == usd("40.00")
    assert body["over_limit"] is True


def test_a_spending_limit_can_be_removed(api, jordan):
    body = api.patch(member_url(jordan), {"spending_limit": None}, format="json").json()
    assert body["spending_limit"] is None
    assert body["over_limit"] is False


def test_the_only_admin_cant_step_down(api, alex):
    response = api.patch(member_url(alex), {"role": "member"}, format="json")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "last_admin"
    assert membership(alex).role == "admin"


def test_with_a_second_admin_the_first_can_step_down(api, alex, jordan):
    api.patch(member_url(jordan), {"role": "admin"}, format="json")
    response = api.patch(member_url(alex), {"role": "member"}, format="json")
    assert response.status_code == 200
    assert membership(alex).role == "member"


# Removing and leaving (10 §3.6, §5) ------------------------------------------------------


def test_removing_a_member_keeps_their_subscriptions_and_drops_them_from_the_total(api, jordan):
    before = Subscription.objects.filter(owner=jordan).count()

    assert api.delete(member_url(jordan)).status_code == 204

    assert Subscription.objects.filter(owner=jordan).count() == before
    body = api.get(FAMILY).json()
    assert body["total"] == usd("152.18")
    assert "Jordan Doe" not in by_name(body)
    assert signed_in(jordan).get(FAMILY).status_code == 404


def test_a_member_can_leave(jordan):
    assert signed_in(jordan).delete(member_url(jordan)).status_code == 204
    assert not Membership.objects.filter(user=jordan).exists()


def test_a_member_cant_remove_someone_else(jordan, sam):
    response = signed_in(jordan).delete(member_url(sam))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "family_admin_only"


def test_the_last_admin_cant_leave_or_remove_themselves(api, alex):
    response = api.delete(member_url(alex))
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "last_admin"


def test_alone_in_the_family_leaving_says_to_delete_it(api, alex, jordan, sam):
    api.delete(member_url(jordan))
    api.delete(member_url(sam))

    response = api.delete(member_url(alex))

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "only_member"
    assert "Delete the family" in response.json()["error"]["message"]


def test_when_the_creator_leaves_another_admin_takes_over(api, alex, jordan):
    api.patch(member_url(jordan), {"role": "admin"}, format="json")

    assert api.delete(member_url(alex)).status_code == 204

    assert Family.objects.get().owner_id == jordan.pk
    assert signed_in(jordan).get(FAMILY).status_code == 200


# Authorization per role per endpoint (10 §4): permissions the API enforces -------------


def _sub_of(user):
    return Subscription.objects.filter(owner=user).first()


WRITES = {
    "create": lambda api, sub: api.post(SUBS, new_sub(), format="json"),
    "update": lambda api, sub: api.patch(f"{SUBS}/{sub.pk}", {"notes": "x"}, format="json"),
    "delete": lambda api, sub: api.delete(f"{SUBS}/{sub.pk}"),
    "cancel": lambda api, sub: api.post(f"{SUBS}/{sub.pk}/cancel"),
    "restore": lambda api, sub: api.post(f"{SUBS}/{sub.pk}/restore"),
}
CODES = {"create": "family_cannot_add"}


@pytest.mark.parametrize("action", WRITES)
def test_a_viewer_cant_write_by_calling_the_api(sam, action):
    sub = _sub_of(sam)
    response = WRITES[action](signed_in(sam), sub)

    assert response.status_code == 403
    assert response.json()["error"]["code"] == CODES.get(action, "family_cannot_edit")
    sub.refresh_from_db()
    assert (sub.status, sub.notes) == ("active", "")


@pytest.mark.parametrize("action", WRITES)
def test_a_member_can_write_with_the_default_permissions(jordan, action):
    response = WRITES[action](signed_in(jordan), _sub_of(jordan))
    assert response.status_code in (200, 201, 204)


@pytest.mark.parametrize("action", WRITES)
def test_an_admin_can_write_whatever_their_flags_say(alex, action):
    Membership.objects.filter(user=alex).update(
        can_add_subscriptions=False, can_edit_own_subs=False
    )
    response = WRITES[action](signed_in(alex), _sub_of(alex))
    assert response.status_code in (200, 201, 204)


def test_a_member_without_add_permission_cant_add(api, jordan):
    api.patch(member_url(jordan), {"can_add_subscriptions": False}, format="json")

    response = signed_in(jordan).post(SUBS, new_sub(), format="json")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "family_cannot_add"
    # Editing is a separate permission and still works.
    sub = _sub_of(jordan)
    assert (
        signed_in(jordan).patch(f"{SUBS}/{sub.pk}", {"notes": "ok"}, format="json").status_code
        == 200
    )


@pytest.mark.parametrize("action", ["update", "delete", "cancel", "restore"])
def test_a_member_without_edit_permission_cant_change_theirs(api, jordan, action):
    api.patch(member_url(jordan), {"can_edit_own_subs": False}, format="json")
    response = WRITES[action](signed_in(jordan), _sub_of(jordan))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "family_cannot_edit"


def test_someone_in_no_family_is_never_limited(loner):
    response = signed_in(loner).post(SUBS, new_sub(name="Mubi"), format="json")
    assert response.status_code == 201


def test_a_viewer_cant_confirm_an_extraction_or_decide_a_trial(sam):
    api = signed_in(sam)
    confirm = api.post("/api/v1/extractions/whatever/confirm", new_sub(), format="json")
    decide = api.post(f"/api/v1/trials/{_sub_of(sam).pk}/decision", {"decision": "keep"})
    assert (confirm.status_code, confirm.json()["error"]["code"]) == (403, "family_cannot_add")
    assert (decide.status_code, decide.json()["error"]["code"]) == (403, "family_cannot_edit")


def test_a_viewer_cant_share_a_subscription(sam):
    sub = _sub_of(sam)
    response = signed_in(sam).post(
        "/api/v1/shared-plans",
        {
            "subscription_id": str(sub.pk),
            "split_mode": "equal",
            "participants": [{"display_name": "Riley"}],
        },
        format="json",
    )
    assert (response.status_code, response.json()["error"]["code"]) == (
        403,
        "family_cannot_edit",
    )
    assert not SharedPlan.objects.filter(subscription=sub).exists()


ADMIN_ONLY = {
    "family_update": lambda api, target: api.patch(FAMILY, {"name": "Mine"}, format="json"),
    "family_delete": lambda api, target: api.delete(FAMILY),
    "member_update": lambda api, target: api.patch(
        member_url(target), {"role": "admin"}, format="json"
    ),
    "member_remove": lambda api, target: api.delete(member_url(target)),
}


@pytest.mark.parametrize("action", ADMIN_ONLY)
@pytest.mark.parametrize("who", ["jordan", "sam"])
def test_family_admin_endpoints_refuse_members_and_viewers(request, jordan, sam, who, action):
    caller = request.getfixturevalue(who)
    target = sam if caller == jordan else jordan
    response = ADMIN_ONLY[action](signed_in(caller), target)

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "family_admin_only"
    assert Membership.objects.count() == 3
    assert Family.objects.get().name == "Kim family"


@pytest.mark.parametrize(
    ("method", "path"),
    [("get", ""), ("patch", ""), ("delete", ""), ("get", "/members/x"), ("delete", "/members/x")],
)
def test_family_endpoints_need_a_signed_in_user(db, method, path):
    response = getattr(APIClient(), method)(FAMILY + path)
    assert response.status_code == 401
