"""The shared client and the retry policy of spec section 12.

Nothing here touches the network: every client is built on an
`httpx.MockTransport`, and `call_with_retries` takes its sleep and its
randomness as arguments so the backoff can be asserted without waiting.
"""

import random

import httpx
import pytest

from core.http import USER_AGENT, backoff_delays, build_client, call_with_retries


class Unjittered:
    """Stands in for `random`, always returning the middle of the range."""

    @staticmethod
    def uniform(low, high):
        return 1.0


def echo_transport(recorder):
    def handle(request):
        recorder.append(request)
        return httpx.Response(200, json={"ok": True})

    return httpx.MockTransport(handle)


# build_client


def test_every_request_identifies_itself_as_subtrak():
    sent = []
    with build_client(timeout=5, transport=echo_transport(sent)) as client:
        client.get("https://example.test/ping")

    assert sent[0].headers["User-Agent"] == USER_AGENT


def test_the_client_applies_the_timeout_budget_it_was_given():
    with build_client(timeout=8, transport=httpx.MockTransport(lambda r: None)) as client:
        assert client.timeout.connect == 8
        assert client.timeout.read == 8
        assert client.timeout.write == 8
        assert client.timeout.pool == 8


def test_caller_headers_are_added_without_dropping_the_user_agent():
    sent = []
    with build_client(
        timeout=5, headers={"Authorization": "Bearer t"}, transport=echo_transport(sent)
    ) as client:
        client.get("https://example.test/ping")

    assert sent[0].headers["Authorization"] == "Bearer t"
    assert sent[0].headers["User-Agent"] == USER_AGENT


def test_a_caller_may_override_the_user_agent():
    sent = []
    with build_client(
        timeout=5, headers={"User-Agent": "SubTrak-eval"}, transport=echo_transport(sent)
    ) as client:
        client.get("https://example.test/ping")

    assert sent[0].headers["User-Agent"] == "SubTrak-eval"


# backoff_delays


def test_delays_grow_exponentially_from_the_base():
    assert backoff_delays(3, base=60, factor=2, rng=Unjittered) == [60, 120, 240]


def test_no_retries_means_no_delays():
    assert backoff_delays(0, base=60, rng=Unjittered) == []


def test_delays_are_jittered_so_workers_do_not_retry_in_lockstep():
    first = backoff_delays(3, base=60, jitter=0.25, rng=random.Random(1))
    second = backoff_delays(3, base=60, jitter=0.25, rng=random.Random(2))

    assert first != second
    # Still recognisably the 1, 2, 4 minute schedule section 12 asks for.
    for delay, unjittered in zip(first + second, [60, 120, 240] * 2, strict=True):
        assert 0.75 * unjittered <= delay <= 1.25 * unjittered


def test_jitter_never_produces_a_negative_wait():
    # A jitter wider than 1 would otherwise push the low end below zero.
    assert all(d >= 0 for d in backoff_delays(4, base=1, jitter=3, rng=random.Random(5)))


# call_with_retries


def test_a_call_that_succeeds_is_made_exactly_once():
    attempts = []

    result = call_with_retries(
        lambda: attempts.append(1) or "done", retries=3, base_delay=1, sleep=lambda d: None
    )

    assert result == "done"
    assert len(attempts) == 1


def test_a_transient_failure_is_retried_and_the_result_returned():
    attempts = []

    def flaky():
        attempts.append(1)
        if len(attempts) < 3:
            raise httpx.ConnectError("boom")
        return "recovered"

    result = call_with_retries(flaky, retries=3, base_delay=1, sleep=lambda d: None)

    assert result == "recovered"
    assert len(attempts) == 3


def test_retries_are_bounded_at_the_number_asked_for():
    attempts = []

    def always_fails():
        attempts.append(1)
        raise httpx.ConnectTimeout("boom")

    with pytest.raises(httpx.ConnectTimeout):
        call_with_retries(always_fails, retries=3, base_delay=1, sleep=lambda d: None)

    # Three retries is four attempts, and then it gives up.
    assert len(attempts) == 4


def test_the_final_failure_reaches_the_caller_so_its_fallback_runs():
    def always_fails():
        raise httpx.ReadTimeout("last one")

    with pytest.raises(httpx.ReadTimeout, match="last one"):
        call_with_retries(always_fails, retries=1, base_delay=1, sleep=lambda d: None)


def test_it_waits_the_backoff_between_attempts():
    waited = []

    def always_fails():
        raise httpx.ConnectError("boom")

    with pytest.raises(httpx.ConnectError):
        call_with_retries(
            always_fails,
            retries=3,
            base_delay=60,
            sleep=waited.append,
            rng=Unjittered,
        )

    assert waited == [60, 120, 240]


def test_an_error_outside_the_retry_list_is_raised_at_once():
    attempts = []

    def wrong_kind():
        attempts.append(1)
        raise ValueError("not a transport problem")

    with pytest.raises(ValueError):
        call_with_retries(wrong_kind, retries=3, base_delay=1, sleep=lambda d: None)

    assert len(attempts) == 1


def test_the_caller_chooses_what_counts_as_retryable():
    attempts = []

    def rejected():
        attempts.append(1)
        raise httpx.HTTPStatusError("503", request=None, response=None)

    with pytest.raises(httpx.HTTPStatusError):
        call_with_retries(
            rejected,
            retries=2,
            base_delay=1,
            retry_on=httpx.HTTPStatusError,
            sleep=lambda d: None,
        )

    assert len(attempts) == 3
