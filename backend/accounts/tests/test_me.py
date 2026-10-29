from datetime import timedelta

import pytest
from django.db import IntegrityError
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from accounts.models import User


@pytest.fixture
def user():
    return User.objects.create_user(email="Sam@Example.com", password="s3cret!pass", name="Sam")


def versioned(user):
    """An access token as the API issues them, with the `tv` claim."""
    token = AccessToken.for_user(user)
    token["tv"] = user.token_version
    return token


def client_with(token):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.mark.django_db
def test_me_rejects_missing_token():
    assert APIClient().get("/api/v1/me").status_code == 401


@pytest.mark.django_db
def test_me_rejects_malformed_token():
    assert client_with("not.a.jwt").get("/api/v1/me").status_code == 401


@pytest.mark.django_db
def test_me_rejects_expired_token(user):
    token = versioned(user)
    token.set_exp(lifetime=-timedelta(seconds=1))

    assert client_with(token).get("/api/v1/me").status_code == 401


@pytest.mark.django_db
def test_me_rejects_token_for_deleted_user(user):
    token = versioned(user)
    user.delete()

    assert client_with(token).get("/api/v1/me").status_code == 401


@pytest.mark.django_db
def test_me_returns_profile_for_valid_token(user):
    response = client_with(versioned(user)).get("/api/v1/me")

    assert response.status_code == 200
    # Exactly the UserProfile shape the mobile client expects, and nothing
    # more: no password hash, no token_version.
    assert response.json() == {
        "id": str(user.pk),
        "email": "sam@example.com",
        "name": "Sam",
        "email_verified": False,
        "has_completed_first_run": False,
    }


@pytest.mark.django_db
def test_me_reports_verified_email(user):
    user.email_verified_at = timezone.now()
    user.save()

    response = client_with(versioned(user)).get("/api/v1/me")

    assert response.json()["email_verified"] is True


@pytest.mark.django_db
def test_me_has_no_trailing_slash(user):
    # Contract paths have none; `/me/` is not a second spelling of it.
    client = client_with(versioned(user))

    assert client.get("/api/v1/me").json()["email"] == "sam@example.com"
    assert client.get("/api/v1/me/").status_code == 404


@pytest.mark.django_db
def test_user_email_is_unique_regardless_of_case(user):
    with pytest.raises(IntegrityError):
        User.objects.create_user(email="SAM@example.com", password="x")


@pytest.mark.django_db
def test_patch_me_records_first_run_and_the_name(user, contract):
    client = client_with(versioned(user))
    path = "/api/v1/me"

    response = client.patch(path, {"has_completed_first_run": True}, format="json")
    renamed = client.patch(path, {"name": "Sam Lee"}, format="json")

    assert contract(response, "/me")["has_completed_first_run"] is True
    assert renamed.json()["name"] == "Sam Lee"
    assert renamed.json()["has_completed_first_run"] is True
    assert client.get("/api/v1/auth/me").json()["has_completed_first_run"] is True


@pytest.mark.django_db
def test_patch_me_keeps_a_cleared_name_apart_from_null(user, contract):
    client = client_with(versioned(user))

    cleared = client.patch("/api/v1/me", {"name": ""}, format="json")

    assert contract(cleared, "/me")["name"] == ""
    assert User.objects.get(pk=user.pk).name == ""
    unset = client.patch("/api/v1/me", {"name": None}, format="json")
    assert unset.json()["name"] is None
    assert User.objects.get(pk=user.pk).name is None


@pytest.mark.django_db
def test_patch_me_validates(user, contract):
    response = client_with(versioned(user)).patch("/api/v1/me", {"name": "x" * 151}, format="json")

    assert response.status_code == 400
    assert "name" in contract(response, "/me")["error"]["fields"]


@pytest.mark.django_db
def test_auth_me_has_no_patch(user):
    response = client_with(versioned(user)).patch("/api/v1/auth/me", {"name": "x"}, format="json")

    assert response.status_code == 405
