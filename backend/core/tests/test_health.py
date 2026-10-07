from unittest import mock

import pytest
from django.db import DatabaseError
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_health_returns_200():
    response = APIClient().get("/api/v1/health/")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


@pytest.mark.django_db
def test_health_needs_no_token():
    # A garbage Authorization header must not turn a liveness probe into a 401.
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer not-a-token")

    assert client.get("/api/v1/health/").status_code == 200


@pytest.mark.django_db
def test_health_returns_503_when_mongodb_is_down():
    with mock.patch("core.views.connection.ensure_connection", side_effect=DatabaseError):
        response = APIClient().get("/api/v1/health/")

    assert response.status_code == 503
    assert response.json()["database"] == "down"
