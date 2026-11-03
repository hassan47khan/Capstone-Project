"""Family invitations (handoff 10 §3.5, §5): invite, resend, revoke, preview,
accept, and the four error states (expired, already accepted, wrong account,
already in a family), plus the seat limit."""

import re
from datetime import timedelta

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from family.models import Family, Invitation, Membership
from subscriptions import seed

FAMILY = "/api/v1/family"
INVITES = f"{FAMILY}/invitations"
PREVIEW = "/api/v1/invitations/preview"
ACCEPT = "/api/v1/invitations/accept"


def signed_in(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def person(email="riley@example.com", name="Riley Park", verified=True):
    user = User.objects.create_user(email=email, name=name, password="x")
    if verified:
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified_at"])
    return user


def token_from_last_email() -> str:
    return re.search(r"token=([\w-]+)", mail.outbox[-1].body).group(1)


def invite(api, email="riley@example.com", role="member"):
    return api.post(INVITES, {"email": email, "role": role}, format="json")


@pytest.fixture
def jordan(alex):
    return User.objects.get(email=seed.JORDAN.email)


@pytest.fixture
def riley(alex):
    return person()


# Inviting ------------------------------------------------------------------------------


def test_an_admin_invites_by_email_and_the_link_is_emailed(api, contract):
    response = invite(api, " Riley@Example.com ", "viewer")
    body = contract(response, "/family/invitations")

    assert response.status_code == 201
    assert (body["email"], body["role"], body["status"]) == (
        "riley@example.com",
        "viewer",
        "pending",
    )
    (message,) = mail.outbox
    assert message.to == ["riley@example.com"]
    assert "Alex Kim invited you to Kim family" in message.subject
    assert "subtrak://family-invite?token=" in message.body
    # The invitee is told what the admin can see, and how to keep a subscription private.
    assert "private" in message.body
    # Only the digest is stored.
    assert token_from_last_email() not in str(Invitation.objects.get().__dict__)


def test_invitations_last_seven_days(api):
    invite(api)
    invitation = Invitation.objects.get()
    assert invitation.expires_at - invitation.sent_at == timedelta(days=7)


def test_the_dashboard_shows_pending_invitations_to_admins_only(api, jordan, contract):
    invite(api)

    body = contract(api.get(FAMILY), "/family")
    assert [i["email"] for i in body["invitations"]] == ["riley@example.com"]
    assert (body["seats_used"], body["seats_taken"], body["can_invite"]) == (3, 4, True)
    assert signed_in(jordan).get(FAMILY).json()["invitations"] == []
    assert signed_in(jordan).get(FAMILY).json()["can_invite"] is False


def test_inviting_someone_already_in_the_family_is_a_clear_error(api):
    response = invite(api, seed.JORDAN.email)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "already_member"
    assert response.json()["error"]["fields"]["email"] == ["They're already in this family."]


def test_inviting_the_same_email_twice_says_resend_instead(api):
    invite(api)
    response = invite(api)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "already_invited"


def test_the_seat_limit_counts_pending_invitations(api, contract):
    invite(api, "one@example.com")
    invite(api, "two@example.com")

    response = invite(api, "three@example.com")

    contract(response, "/family/invitations")
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "seat_limit_reached"
    assert "Upgrade" in error["message"]
    assert api.get(FAMILY).json()["can_invite"] is False


def test_only_admins_invite(jordan):
    response = invite(signed_in(jordan))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "family_admin_only"


def test_a_bad_email_is_400(api):
    response = invite(api, "not-an-email")
    assert response.status_code == 400
    assert "email" in response.json()["error"]["fields"]


# Resend and revoke (10 §6: "Invited" rows) --------------------------------------------------


def test_resend_sends_a_new_link_and_the_old_one_stops_working(api, riley):
    invite(api)
    old = token_from_last_email()
    invitation = Invitation.objects.get()

    response = api.post(f"{INVITES}/{invitation.pk}/resend")

    assert response.status_code == 200
    new = token_from_last_email()
    assert new != old
    assert signed_in(riley).post(ACCEPT, {"token": old}).status_code == 404
    assert signed_in(riley).post(ACCEPT, {"token": new}).status_code == 200


def test_resending_an_expired_invitation_gives_it_seven_more_days(api):
    invite(api)
    Invitation.objects.update(expires_at=timezone.now() - timedelta(days=1))
    assert api.get(FAMILY).json()["invitations"][0]["status"] == "expired"

    body = api.post(f"{INVITES}/{Invitation.objects.get().pk}/resend").json()

    assert body["status"] == "pending"


def test_an_expired_invitation_frees_its_seat_until_resent(api):
    invite(api, "one@example.com")
    invite(api, "two@example.com")
    Invitation.objects.filter(email="one@example.com").update(
        expires_at=timezone.now() - timedelta(days=1)
    )
    assert invite(api, "three@example.com").status_code == 201

    stale = Invitation.objects.get(email="one@example.com")
    response = api.post(f"{INVITES}/{stale.pk}/resend")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "seat_limit_reached"


def test_revoking_ends_the_link_and_frees_the_seat(api, riley, contract):
    invite(api)
    token = token_from_last_email()

    assert api.delete(f"{INVITES}/{Invitation.objects.get().pk}").status_code == 204

    assert api.get(FAMILY).json()["invitations"] == []
    response = signed_in(riley).post(ACCEPT, {"token": token})
    contract(response, "/invitations/accept")
    assert response.status_code == 410
    assert response.json()["error"]["code"] == "invitation_revoked"


def test_a_revoked_invitation_cant_be_resent(api):
    invite(api)
    pk = Invitation.objects.get().pk
    api.delete(f"{INVITES}/{pk}")
    response = api.post(f"{INVITES}/{pk}/resend")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "invitation_revoked"


@pytest.mark.parametrize("method", ["post", "delete"])
def test_another_familys_invitation_is_404(api, method):
    other = person("other@example.com", "Other Admin")
    signed_in(other).post(FAMILY, {"name": "Others"}, format="json")
    invite(signed_in(other), "someone@example.com")
    pk = Invitation.objects.get(email="someone@example.com").pk

    path = f"{INVITES}/{pk}/resend" if method == "post" else f"{INVITES}/{pk}"
    assert getattr(api, method)(path).status_code == 404


@pytest.mark.parametrize("who", ["jordan", "sam"])
def test_only_admins_resend_or_revoke(api, request, who):
    invite(api)
    pk = Invitation.objects.get().pk
    caller = signed_in(User.objects.get(email=getattr(seed, who.upper()).email))
    assert caller.post(f"{INVITES}/{pk}/resend").status_code == 403
    assert caller.delete(f"{INVITES}/{pk}").status_code == 403
    assert Invitation.objects.get().status == "pending"


# Accepting (10 §3.5 steps 3-4, §5) ----------------------------------------------------------


def test_preview_then_accept_joins_with_the_invited_role(api, riley, contract):
    invite(api, role="viewer")
    token = token_from_last_email()
    client = signed_in(riley)

    preview = contract(client.post(PREVIEW, {"token": token}), "/invitations/preview")
    assert preview["family_name"] == "Kim family"
    assert preview["invited_by"] == "Alex Kim"
    assert (preview["role"], preview["status"], preview["problem"]) == ("viewer", "pending", None)

    response = client.post(ACCEPT, {"token": token})
    body = contract(response, "/invitations/accept")
    assert body["you"]["role"] == "viewer"
    assert [m["name"] for m in body["members"]][-1] == "Riley Park"
    assert Invitation.objects.get().status == "accepted"
    assert api.get(FAMILY).json()["seats_used"] == 4


def test_an_existing_account_with_subscriptions_brings_them_into_the_total(api, riley, categories):
    signed_in(riley).post(
        "/api/v1/subscriptions",
        {
            "name": "Mubi",
            "billing_price": "10.99",
            "start_date": "2026-09-20",
            "category": "entertainment",
        },
        format="json",
    )
    invite(api)
    signed_in(riley).post(ACCEPT, {"token": token_from_last_email()})

    assert api.get(FAMILY).json()["total"] == {"amount": "209.15", "currency": "USD"}


def test_an_expired_invitation_says_so(api, riley, contract):
    invite(api)
    token = token_from_last_email()
    Invitation.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
    client = signed_in(riley)

    assert client.post(PREVIEW, {"token": token}).json()["problem"] == "expired"
    response = client.post(ACCEPT, {"token": token})
    contract(response, "/invitations/accept")
    assert response.status_code == 410
    assert response.json()["error"]["code"] == "invitation_expired"
    assert not Membership.objects.filter(user=riley).exists()


def test_an_invitation_works_once(api, riley):
    invite(api)
    token = token_from_last_email()
    client = signed_in(riley)
    client.post(ACCEPT, {"token": token})
    client.delete(f"{FAMILY}/members/{Membership.objects.get(user=riley).pk}")

    assert client.post(PREVIEW, {"token": token}).json()["problem"] == "accepted"
    response = client.post(ACCEPT, {"token": token})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "invitation_accepted"


def test_the_wrong_account_cant_accept(api, riley):
    invite(api, "someone-else@example.com")
    token = token_from_last_email()
    client = signed_in(riley)

    assert client.post(PREVIEW, {"token": token}).json()["problem"] == "wrong_account"
    response = client.post(ACCEPT, {"token": token})
    assert response.status_code == 403
    error = response.json()["error"]
    assert error["code"] == "wrong_account"
    assert "someone-else@example.com" in error["message"]


def test_someone_in_another_family_is_blocked_with_a_clear_message(api, riley):
    signed_in(riley).post(FAMILY, {"name": "Parks"}, format="json")
    invite(api)
    token = token_from_last_email()
    client = signed_in(riley)

    assert client.post(PREVIEW, {"token": token}).json()["problem"] == "in_another_family"
    response = client.post(ACCEPT, {"token": token})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "already_in_family"
    assert Invitation.objects.get().status == "pending"


def test_an_unverified_account_must_confirm_its_email_first(api):
    newcomer = person("new@example.com", "New Person", verified=False)
    invite(api, "new@example.com")
    response = signed_in(newcomer).post(ACCEPT, {"token": token_from_last_email()})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "email_unverified"


def test_a_made_up_token_is_404(riley, contract):
    response = signed_in(riley).post(PREVIEW, {"token": "nope"})
    contract(response, "/invitations/preview")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "invitation_not_found"


def test_a_token_is_required(riley):
    response = signed_in(riley).post(ACCEPT, {})
    assert response.status_code == 400


@pytest.mark.parametrize("path", [PREVIEW, ACCEPT, INVITES])
def test_invitation_endpoints_need_a_signed_in_user(db, path):
    assert APIClient().post(path, {"token": "x"}).status_code == 401


def test_ending_the_family_removes_its_invitations(api):
    invite(api)
    api.delete(FAMILY)
    assert not Invitation.objects.exists()
    assert not Family.objects.exists()
