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


def client_with(token):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.mark.django_db
def test_me_rejects_missing_token():
    assert APIClient().get("/api/v1/me/").status_code == 401


@pytest.mark.django_db
def test_me_rejects_malformed_token():
    assert client_with("not.a.jwt").get("/api/v1/me/").status_code == 401


@pytest.mark.django_db
def test_me_rejects_expired_token(user):
    token = AccessToken.for_user(user)
    token.set_exp(lifetime=-timedelta(seconds=1))

    assert client_with(token).get("/api/v1/me/").status_code == 401


@pytest.mark.django_db
def test_me_rejects_token_for_deleted_user(user):
    token = AccessToken.for_user(user)
    user.delete()

    assert client_with(token).get("/api/v1/me/").status_code == 401


@pytest.mark.django_db
def test_me_returns_profile_for_valid_token(user):
    response = client_with(AccessToken.for_user(user)).get("/api/v1/me/")

    assert response.status_code == 200
    # Exactly the UserProfile shape the mobile client expects, and nothing
    # more: no password hash, no token_version.
    assert response.json() == {
        "id": str(user.pk),
        "email": "sam@example.com",
        "name": "Sam",
        "email_verified": False,
    }


@pytest.mark.django_db
def test_me_reports_verified_email(user):
    user.email_verified_at = timezone.now()
    user.save()

    response = client_with(AccessToken.for_user(user)).get("/api/v1/me/")

    assert response.json()["email_verified"] is True


@pytest.mark.django_db
def test_me_without_trailing_slash_is_served_not_redirected(user):
    # The mobile client requests `/me`; a 301 would drop PATCH bodies later.
    response = client_with(AccessToken.for_user(user)).get("/api/v1/me")

    assert response.status_code == 200
    assert response.json()["email"] == "sam@example.com"


@pytest.mark.django_db
def test_user_email_is_unique_regardless_of_case(user):
    with pytest.raises(IntegrityError):
        User.objects.create_user(email="SAM@example.com", password="x")
