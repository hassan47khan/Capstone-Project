"""Shapes every endpoint shares: money, the error envelope, and the handler that
produces it (spec section 5, handoff 04 §5).

Money leaves the API as a decimal string plus its currency, rounded once, here,
at the boundary (handoff 04 §3.4). Every error leaves it as
{"error": {"code", "message", "fields"}}; screens branch on `code` and show
`message`, and a form reads `fields` to mark the right input.
"""

from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from drf_spectacular.utils import OpenApiResponse
from rest_framework import exceptions, serializers, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

from subscriptions.services.money import round_money

# Money ---------------------------------------------------------------------


class MoneySerializer(serializers.Serializer):
    """An amount always travels with its currency, e.g. {"amount": "129.20", "currency": "USD"}."""

    amount = serializers.CharField(
        help_text="Decimal string, rounded to the currency's minor unit."
    )
    currency = serializers.CharField(help_text="ISO 4217 code.")


def money(amount: Decimal | None, currency: str) -> dict | None:
    """Presentation rounding for one amount. None stays None (no rate to convert with)."""
    if amount is None:
        return None
    return {"amount": str(round_money(amount, currency)), "currency": currency}


def rounded(amount: Decimal, currency: str) -> dict:
    """For an amount that is already rounded, such as a line from round_to_total."""
    return {"amount": str(amount), "currency": currency}


# Errors --------------------------------------------------------------------


class ErrorDetailSerializer(serializers.Serializer):
    code = serializers.CharField()
    message = serializers.CharField()
    fields = serializers.DictField(
        child=serializers.ListField(child=serializers.CharField()),
        required=False,
        help_text="Present on 400s: form field name to its messages.",
    )


class ErrorSerializer(serializers.Serializer):
    error = ErrorDetailSerializer()


class ApiError(exceptions.APIException):
    """An error with a product meaning: its own status, code and user-facing message."""

    def __init__(self, status_code: int, code: str, message: str, fields=None):
        super().__init__(detail=message, code=code)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.fields = fields


def not_found() -> ApiError:
    return ApiError(status.HTTP_404_NOT_FOUND, "not_found", "Not found.")


# A failing field that has its own code, so the client can branch without
# reading `fields` (spec section 5's own example).
_FIELD_CODES = {"billing_price": "price_invalid"}

_STATUS_CODES = {
    401: "token_invalid",
    403: "permission_denied",
    404: "not_found",
    405: "method_not_allowed",
    415: "unsupported_media_type",
    429: "throttled",
}


def _flatten(detail, prefix="") -> dict[str, list[str]]:
    """DRF's nested error detail as {"field": [messages]}; nested fields dotted."""
    if isinstance(detail, dict):
        fields = {}
        for key, value in detail.items():
            name = f"{prefix}.{key}" if prefix else str(key)
            fields.update(_flatten(value, name))
        return fields
    if isinstance(detail, list) and all(isinstance(item, str) for item in detail):
        return {prefix or "non_field_errors": [str(item) for item in detail]}
    if isinstance(detail, list):
        fields = {}
        for index, item in enumerate(detail):
            fields.update(_flatten(item, f"{prefix}.{index}" if prefix else str(index)))
        return fields
    return {prefix or "non_field_errors": [str(detail)]}


def _validation_body(fields: dict[str, list[str]]) -> dict:
    general = fields.pop("non_field_errors", None)
    code = next((_FIELD_CODES[name] for name in fields if name in _FIELD_CODES), None)
    message = (general or next(iter(fields.values()), ["Check the highlighted fields."]))[0]
    body = {"code": code or "validation_error", "message": message}
    if fields:
        body["fields"] = fields
    return body


def handle_exception(exc, context):
    """REST_FRAMEWORK["EXCEPTION_HANDLER"]: every error in the one envelope."""
    if isinstance(exc, DjangoValidationError):
        # Raised by Model.full_clean() inside an operation; same meaning as a 400.
        detail = (
            exc.message_dict if hasattr(exc, "error_dict") else {"non_field_errors": exc.messages}
        )
        return Response({"error": _validation_body(_flatten(detail))}, status=400)
    if isinstance(exc, Http404):
        exc = not_found()

    response = exception_handler(exc, context)
    if response is None:
        return None  # A real 500: let Django report it.

    if isinstance(exc, ApiError):
        body = {"code": exc.code, "message": exc.message}
        if exc.fields:
            body["fields"] = exc.fields
    elif isinstance(exc, exceptions.ValidationError):
        body = _validation_body(_flatten(exc.detail))
    else:
        code = _STATUS_CODES.get(response.status_code, "error")
        if response.status_code == 401 and isinstance(exc, exceptions.NotAuthenticated):
            code = "not_authenticated"
        message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        body = {"code": code, "message": str(message)}
    response.data = {"error": body}
    return response


# Schema helpers --------------------------------------------------------------

_ERROR_DESCRIPTIONS = {
    400: "Validation failed; `error.fields` names each problem.",
    401: "Missing, expired or invalid token.",
    403: "Not allowed.",
    404: "Not found, or not yours.",
    409: "Conflicts with the current state.",
    423: "Account temporarily locked.",
    429: "Throttled. Retry after the `Retry-After` header.",
    503: "A dependency is down.",
}


def errors(*codes: int) -> dict:
    """The error responses an operation documents, for extend_schema(responses=...)."""
    return {
        code: OpenApiResponse(response=ErrorSerializer, description=_ERROR_DESCRIPTIONS[code])
        for code in codes
    }
