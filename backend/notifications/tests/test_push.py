"""The Expo push client (spec section 12's budget).

Mapped against Expo's documented shapes, with every call stubbed through
`httpx.MockTransport` so nothing leaves the machine.
"""

import httpx
import pytest

from notifications import push


def recording(payload, status=200):
    """A transport that captures requests and answers with `payload`."""
    seen = []

    def handle(request):
        seen.append(request)
        return httpx.Response(status, json=payload)

    return httpx.MockTransport(handle), seen


def tickets(*statuses):
    return {"data": [{"status": s, "id": f"receipt-{i}"} for i, s in enumerate(statuses)]}


def message(token="ExponentPushToken[a]"):
    return push.message_for(token, title="t", body="b")


# Sending ---------------------------------------------------------------------------


def test_a_message_carries_what_expo_requires():
    built = push.message_for("ExponentPushToken[a]", title="Renewal", body="Netflix renews.")

    assert built["to"] == "ExponentPushToken[a]"
    assert built["title"] == "Renewal"
    assert built["body"] == "Netflix renews."


def test_sending_nothing_makes_no_request():
    transport, seen = recording(tickets())

    assert push.send([], transport=transport) == []
    assert seen == []


def test_a_ticket_comes_back_for_each_message():
    transport, _ = recording(tickets("ok"))

    sent = push.send([message()], transport=transport)

    assert len(sent) == 1
    assert sent[0].accepted is True
    assert sent[0].receipt_id == "receipt-0"


def test_tickets_are_matched_to_tokens_in_order():
    # Expo answers in order. Pairing them up wrongly would deactivate a
    # live token and keep pushing at a dead one.
    transport, _ = recording(
        {
            "data": [
                {"status": "ok", "id": "r0"},
                {"status": "error", "details": {"error": push.DEVICE_NOT_REGISTERED}},
            ]
        }
    )

    sent = push.send([message("tok-a"), message("tok-b")], transport=transport)

    assert [(t.token, t.accepted) for t in sent] == [("tok-a", True), ("tok-b", False)]
    assert sent[1].token_is_dead is True


def test_a_short_reply_is_an_error_rather_than_a_silent_mismatch():
    transport, _ = recording(tickets("ok"))

    with pytest.raises(ValueError):
        push.send([message("tok-a"), message("tok-b")], transport=transport)


def test_messages_are_sent_in_batches_of_at_most_a_hundred():
    # Expo rejects a larger request outright (PUSH_TOO_MANY_NOTIFICATIONS).
    sizes = []

    def handle(request):
        import json

        batch = json.loads(request.content)
        sizes.append(len(batch))
        return httpx.Response(200, json=tickets(*["ok"] * len(batch)))

    push.send([message(f"tok-{i}") for i in range(250)], transport=httpx.MockTransport(handle))

    assert sizes == [100, 100, 50]


def test_a_server_error_is_raised_so_the_caller_can_retry():
    transport, _ = recording({}, status=503)

    with pytest.raises(httpx.HTTPStatusError):
        push.send([message()], transport=transport)


def test_the_send_gives_up_after_the_ten_seconds_section_12_allows():
    assert push.TIMEOUT_SECONDS == 10


# Authorisation ----------------------------------------------------------------------


def test_no_bearer_header_without_an_access_token(settings):
    # Expo only requires one when enhanced push security is on, so an unset
    # token is a supported setup rather than a broken one.
    settings.EXPO_ACCESS_TOKEN = None
    transport, seen = recording(tickets("ok"))

    push.send([message()], transport=transport)

    assert "Authorization" not in seen[0].headers


def test_the_access_token_is_sent_as_a_bearer_when_configured(settings):
    settings.EXPO_ACCESS_TOKEN = "expo-token"
    transport, seen = recording(tickets("ok"))

    push.send([message()], transport=transport)

    assert seen[0].headers["Authorization"] == "Bearer expo-token"


# Receipts ------------------------------------------------------------------------------


def test_asking_about_nothing_makes_no_request():
    transport, seen = recording({})

    assert push.receipts([], transport=transport) == {}
    assert seen == []


def test_receipts_come_back_keyed_by_ticket_id():
    transport, _ = recording(
        {
            "data": {
                "r0": {"status": "ok"},
                "r1": {"status": "error", "details": {"error": push.DEVICE_NOT_REGISTERED}},
            }
        }
    )

    found = push.receipts(["r0", "r1"], transport=transport)

    assert found["r0"].status == "ok"
    assert found["r1"].error == push.DEVICE_NOT_REGISTERED


def test_an_id_expo_has_no_answer_for_is_simply_absent():
    transport, _ = recording({"data": {"r0": {"status": "ok"}}})

    found = push.receipts(["r0", "r1"], transport=transport)

    # Not an error: the next run asks again.
    assert set(found) == {"r0"}
