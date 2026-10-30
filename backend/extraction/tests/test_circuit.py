"""The brakes on the model: kill switch, circuit breaker and per-user cap."""

from datetime import timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone

from extraction import circuit
from extraction.llm import LLMUnavailable, LLMUnusable
from extraction.models import ExtractionAttempt


@pytest.fixture(autouse=True)
def configured(settings):
    settings.EXTRACTION_ENABLED = True
    settings.LLM_API_KEY = "sk-test"
    settings.EXTRACTION_DAILY_CAP = 3
    return settings


def failing():
    raise LLMUnavailable("down")


def fail(times):
    for _ in range(times):
        with pytest.raises(LLMUnavailable):
            circuit.guarded(failing)


# State ------------------------------------------------------------------------------------


def test_a_configured_model_is_ok():
    assert circuit.state() == circuit.OK


def test_the_kill_switch_stops_every_call(configured):
    configured.EXTRACTION_ENABLED = False
    calls = []

    with pytest.raises(LLMUnavailable):
        circuit.guarded(lambda: calls.append(1))

    assert circuit.state() == circuit.DISABLED
    assert calls == []


def test_no_key_is_reported_as_unconfigured(configured):
    configured.LLM_API_KEY = None

    assert circuit.state() == circuit.UNCONFIGURED


# The breaker ------------------------------------------------------------------------------


def test_the_circuit_opens_after_three_failures_in_a_row():
    fail(circuit.FAILURES_TO_OPEN - 1)
    assert circuit.state() == circuit.OK

    fail(1)

    assert circuit.state() == circuit.OPEN


def test_an_open_circuit_answers_at_once_without_calling_the_model():
    fail(circuit.FAILURES_TO_OPEN)
    calls = []

    with pytest.raises(LLMUnavailable):
        circuit.guarded(lambda: calls.append(1))

    assert calls == []


def test_a_success_resets_the_count():
    fail(circuit.FAILURES_TO_OPEN - 1)
    circuit.guarded(lambda: "ok")

    fail(circuit.FAILURES_TO_OPEN - 1)

    assert circuit.state() == circuit.OK


def test_after_the_wait_one_probe_is_let_through_and_success_closes_it():
    fail(circuit.FAILURES_TO_OPEN)
    cache.set("extraction:llm:open_until", timezone.now().timestamp() - 1)

    assert circuit.guarded(lambda: "answer") == "answer"
    assert circuit.state() == circuit.OK


def test_a_failed_probe_opens_it_again_straight_away():
    fail(circuit.FAILURES_TO_OPEN)
    cache.set("extraction:llm:open_until", timezone.now().timestamp() - 1)

    fail(1)

    assert circuit.state() == circuit.OPEN


def test_an_unusable_answer_does_not_count_as_the_model_being_down():
    def unusable():
        raise LLMUnusable("not json")

    for _ in range(circuit.FAILURES_TO_OPEN + 1):
        with pytest.raises(LLMUnusable):
            circuit.guarded(unusable)

    assert circuit.state() == circuit.OK


# The per-user cap -------------------------------------------------------------------------


def attempt(user, n, *, called=True, age=timedelta(0)):
    row = ExtractionAttempt.objects.create(
        owner=user, message_hash=f"h{n}-{age}", outcome="pending", called_model=called
    )
    ExtractionAttempt.objects.filter(pk=row.pk).update(created_at=timezone.now() - age)


@pytest.mark.django_db
def test_the_cap_counts_model_calls_in_the_last_day(alex):
    for n in range(3):
        attempt(alex, n)

    assert circuit.calls_in_last_day(alex) == 3
    assert circuit.under_cap(alex) is False


@pytest.mark.django_db
def test_calls_older_than_a_day_do_not_count(alex):
    for n in range(3):
        attempt(alex, n, age=timedelta(hours=25))

    assert circuit.under_cap(alex) is True


@pytest.mark.django_db
def test_emails_screened_out_before_the_model_do_not_count(alex):
    for n in range(3):
        attempt(alex, n, called=False)

    assert circuit.under_cap(alex) is True


@pytest.mark.django_db
def test_one_users_calls_do_not_use_up_anothers_cap(alex, django_user_model):
    other = django_user_model.objects.create_user(email="jordan@example.com", password="longenough")
    for n in range(3):
        attempt(other, n)

    assert circuit.under_cap(alex) is True
