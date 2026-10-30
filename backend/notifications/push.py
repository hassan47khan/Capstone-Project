"""The Expo Push Service client (spec section 8, section 12's budget).

Verified against Expo's current docs rather than memory
(https://docs.expo.dev/push-notifications/sending-notifications/):

* send is `POST https://exp.host/--/api/v2/push/send`, **at most 100
  messages** per request, and the reply's `data` holds one ticket per
  message *in the order they were sent*;
* receipts are `POST .../getReceipts` with at most 1000 ids, keyed by
  ticket id, and should be read about 15 minutes later;
* a bearer token is only needed when enhanced push security is on in the
  EAS dashboard, so `EXPO_ACCESS_TOKEN` is optional;
* `status: "ok"` means Expo accepted the message, **not** that a device got
  it. Only the receipt says that, which is why `check_push_receipts` exists.

`DeviceNotRegistered` can arrive in a ticket *or* in a receipt, so both
paths deactivate the token.
"""

from dataclasses import dataclass

import httpx
from django.conf import settings

from core.http import build_client

SEND_URL = "https://exp.host/--/api/v2/push/send"
RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"

# Expo's own limits; going over them is a whole-request error.
MAX_MESSAGES = 100
MAX_RECEIPT_IDS = 1000

# Spec section 12's budget for the push gateway.
TIMEOUT_SECONDS = 10

# Expo's wording for "this token is dead". Stop sending to it.
DEVICE_NOT_REGISTERED = "DeviceNotRegistered"


@dataclass(frozen=True)
class Ticket:
    """Expo's answer for one message: accepted, or why not."""

    token: str
    status: str
    receipt_id: str | None = None
    error: str | None = None

    @property
    def accepted(self) -> bool:
        return self.status == "ok"

    @property
    def token_is_dead(self) -> bool:
        return self.error == DEVICE_NOT_REGISTERED


def _client(transport: httpx.BaseTransport | None):
    headers = {"Accept": "application/json"}
    # Only required when enhanced push security is enabled, so an unset
    # token is a supported configuration rather than a misconfiguration.
    if settings.EXPO_ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {settings.EXPO_ACCESS_TOKEN}"
    return build_client(timeout=TIMEOUT_SECONDS, headers=headers, transport=transport)


def _batches(items: list, size: int):
    for start in range(0, len(items), size):
        yield items[start : start + size]


def send(messages: list[dict], *, transport: httpx.BaseTransport | None = None) -> list[Ticket]:
    """Send messages and return one ticket each, in the order given.

    Raises on a transport error or a non-2xx so the caller can retry the
    whole batch; a per-message rejection comes back as a ticket instead,
    because one dead token must not stop the other 99.
    """
    if not messages:
        return []
    tickets: list[Ticket] = []
    with _client(transport) as client:
        for batch in _batches(messages, MAX_MESSAGES):
            response = client.post(SEND_URL, json=batch)
            response.raise_for_status()
            rows = response.json().get("data") or []
            # Expo answers in order, so a short reply would silently shift
            # every ticket onto the wrong token.
            for message, row in zip(batch, rows, strict=True):
                tickets.append(
                    Ticket(
                        token=message["to"],
                        status=row.get("status", "error"),
                        receipt_id=row.get("id"),
                        error=(row.get("details") or {}).get("error"),
                    )
                )
    return tickets


def receipts(
    receipt_ids: list[str], *, transport: httpx.BaseTransport | None = None
) -> dict[str, Ticket]:
    """Read delivery receipts, keyed by ticket id.

    Ids Expo has no answer for yet are simply absent, which is not an error:
    the next run asks again.
    """
    if not receipt_ids:
        return {}
    found: dict[str, Ticket] = {}
    with _client(transport) as client:
        for batch in _batches(receipt_ids, MAX_RECEIPT_IDS):
            response = client.post(RECEIPTS_URL, json={"ids": batch})
            response.raise_for_status()
            for receipt_id, row in (response.json().get("data") or {}).items():
                found[receipt_id] = Ticket(
                    token="",
                    status=row.get("status", "error"),
                    receipt_id=receipt_id,
                    error=(row.get("details") or {}).get("error"),
                )
    return found


def message_for(token: str, *, title: str, body: str, data: dict | None = None) -> dict:
    """One Expo message. `to` is the only required field."""
    return {"to": token, "title": title, "body": body, "sound": "default", "data": data or {}}
