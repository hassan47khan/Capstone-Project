"""The error envelope and money helpers every endpoint shares (spec section 5)."""

from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions

from core.contract import _flatten, handle_exception, money


def envelope(exc):
    return handle_exception(exc, {}).data["error"]


def test_money_rounds_once_at_the_boundary():
    assert money(Decimal("129.195"), "USD") == {"amount": "129.20", "currency": "USD"}
    assert money(Decimal("1500.4"), "JPY") == {"amount": "1500", "currency": "JPY"}
    assert money(None, "USD") is None


def test_nested_errors_are_flattened_to_dotted_fields():
    detail = {
        "participants": [{}, {"display_name": ["Required."]}],
        "non_field_errors": ["Pick one."],
    }

    assert _flatten(detail) == {
        "participants.1.display_name": ["Required."],
        "non_field_errors": ["Pick one."],
    }
    assert _flatten("Plain.") == {"non_field_errors": ["Plain."]}


def test_a_general_validation_error_uses_its_own_message():
    body = envelope(exceptions.ValidationError(["Send both start and end, or neither."]))

    assert body == {"code": "validation_error", "message": "Send both start and end, or neither."}


def test_a_model_validation_error_is_a_400_in_the_envelope():
    field = handle_exception(DjangoValidationError({"name": ["Enter a name."]}), {})
    general = envelope(DjangoValidationError("Something is off."))

    assert field.status_code == 400
    assert field.data["error"]["fields"] == {"name": ["Enter a name."]}
    assert general == {"code": "validation_error", "message": "Something is off."}


@pytest.mark.parametrize(
    ("exc", "status", "code"),
    [
        (Http404(), 404, "not_found"),
        (exceptions.MethodNotAllowed("PUT"), 405, "method_not_allowed"),
        (exceptions.Throttled(wait=60), 429, "throttled"),
        (exceptions.PermissionDenied(), 403, "permission_denied"),
        (exceptions.NotAcceptable(), 406, "error"),
    ],
)
def test_status_codes_map_to_error_codes(exc, status, code):
    response = handle_exception(exc, {})

    assert response.status_code == status
    assert response.data["error"]["code"] == code


def test_an_unexpected_exception_is_left_to_django():
    assert handle_exception(ValueError("boom"), {}) is None


def test_method_not_allowed_over_http(api):
    response = api.put("/api/v1/trials")

    assert response.status_code == 405
    assert response.json()["error"]["code"] == "method_not_allowed"
