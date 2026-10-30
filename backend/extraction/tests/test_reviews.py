"""The inbox scan and the review queue (04 §6a, 11 §2.4, §2.8, §2.9).

Gmail is a fake Google and the model is a fake answering from the eval
fixtures, so these run the real scan, screen, pipeline and queue end to end
without touching the network.
"""

from datetime import timedelta
from unittest import mock

import pytest
from django.core.cache import cache
from django.core.management import CommandError, call_command
from django.utils import timezone
from kombu.exceptions import OperationalError
from rest_framework.test import APIClient

from extraction import circuit, crypto, llm, reviews
from extraction.models import ExtractionAttempt, GmailConnection, PendingExtraction
from subscriptions.models import Subscription

from .conftest import fixture_email

SCAN = "/api/v1/extractions/scan"
PENDING = "/api/v1/extractions/pending"
Outcome = ExtractionAttempt.Outcome


@pytest.fixture
def connected(alex, google):
    GmailConnection.objects.create(
        user=alex,
        email=google.address,
        refresh_token_encrypted=crypto.encrypt("refresh-1"),
        scopes="https://www.googleapis.com/auth/gmail.readonly",
        connected_at=timezone.now(),
    )
    return google


@pytest.fixture
def other(db, django_user_model):
    user = django_user_model.objects.create_user(email="jordan@example.com", password="longenough")
    client = APIClient()
    client.force_authenticate(user)
    return user, client


def deliver(google, *case_ids):
    for case_id in case_ids:
        google.deliver(case_id, *fixture_email(case_id))


def scan(api):
    return api.post(SCAN)


# Starting a scan --------------------------------------------------------------------------


@pytest.mark.django_db
def test_scanning_without_gmail_is_gmail_not_connected(api, model, contract):
    response = scan(api)

    assert response.status_code == 409
    assert contract(response, "/extractions/scan")["error"]["code"] == "gmail_not_connected"


@pytest.mark.django_db
def test_a_revoked_grant_cannot_scan(api, alex, connected, model):
    GmailConnection.objects.filter(user=alex).update(revoked_at=timezone.now())

    assert scan(api).json()["error"]["code"] == "gmail_not_connected"


@pytest.mark.django_db
@pytest.mark.parametrize("setting", ["EXTRACTION_ENABLED", "LLM_API_KEY"])
def test_with_the_model_switched_off_the_scan_routes_to_manual_entry(
    api, connected, model, settings, setting, contract
):
    setattr(settings, setting, False if setting == "EXTRACTION_ENABLED" else None)

    response = scan(api)

    assert response.status_code == 503
    assert contract(response, "/extractions/scan")["error"]["code"] == "extraction_unavailable"


@pytest.mark.django_db
def test_an_open_circuit_answers_503_at_once(api, connected, model):
    cache.set("extraction:llm:open_until", timezone.now().timestamp() + 60)

    assert scan(api).status_code == 503
    assert model.calls == 0


@pytest.mark.django_db
def test_a_spent_daily_cap_is_429_with_retry_after(api, alex, connected, model, settings, contract):
    settings.EXTRACTION_DAILY_CAP = 2
    for n in range(2):
        ExtractionAttempt.objects.create(
            owner=alex, message_hash=f"h{n}", outcome=Outcome.PENDING, called_model=True
        )

    response = scan(api)

    assert response.status_code == 429
    assert contract(response, "/extractions/scan")["error"]["code"] == "throttled"
    assert 0 < int(response["Retry-After"]) <= 24 * 60 * 60


@pytest.mark.django_db
def test_with_the_broker_down_the_scan_is_unavailable_not_stuck(api, alex, connected, model):
    with mock.patch("extraction.tasks.scan_inbox.delay", side_effect=OperationalError("down")):
        response = scan(api)

    assert response.status_code == 503
    # And the app is not told a scan is running that never will.
    assert api.get(PENDING).json()["scanning"] is False


@pytest.mark.django_db
def test_a_scan_answers_202_and_its_results_arrive_in_pending(api, connected, model, contract):
    deliver(connected, "figma-receipt")

    response = scan(api)

    assert response.status_code == 202
    assert contract(response, "/extractions/scan") == {"status": "scanning"}
    body = contract(api.get(PENDING), "/extractions/pending")
    assert body["scanning"] is False
    assert [r["fields"]["service_name"] for r in body["results"]] == ["Figma"]


@pytest.mark.django_db
def test_the_app_is_told_while_a_scan_is_still_running(api, alex):
    cache.set(f"extraction:scanning:{alex.pk}", True, 60)

    assert api.get(PENDING).json()["scanning"] is True


# What the scan does -------------------------------------------------------------------------


@pytest.mark.django_db
def test_hulus_email_becomes_a_review_offering_to_update_the_existing_hulu(
    api, alex, connected, model
):
    deliver(connected, "hulu-trial")

    scan(api)

    row = api.get(PENDING).json()["results"][0]
    assert row["fields"]["price"] == "17.99"
    assert row["fields"]["trial_ends_on"] == "2026-10-19"
    assert row["flagged"] == []
    # 11 §2.8: "Update the existing one" instead of a second Hulu.
    assert row["duplicate_of"] == str(Subscription.objects.get(owner=alex, name="Hulu").pk)


@pytest.mark.django_db
def test_nothing_becomes_a_subscription_until_confirmed(api, alex, connected, model):
    before = Subscription.objects.filter(owner=alex).count()
    deliver(connected, "figma-receipt", "notion-yearly", "disney-trial-relative")

    scan(api)

    # 11 §2.7(1): never auto-create from model output.
    assert Subscription.objects.filter(owner=alex).count() == before
    assert PendingExtraction.objects.filter(owner=alex).count() == 3


@pytest.mark.django_db
def test_emails_screened_out_never_reach_the_model_or_the_cap(api, alex, connected, model):
    deliver(connected, "spanish-netflix", "amazon-order")

    scan(api)

    assert model.calls == 0
    assert circuit.calls_in_last_day(alex) == 0
    assert set(ExtractionAttempt.objects.values_list("outcome", flat=True)) == {Outcome.SKIPPED}


@pytest.mark.django_db
def test_an_email_the_model_says_is_not_a_subscription_is_skipped(api, alex, connected, model):
    deliver(connected, "peacock-advert")

    scan(api)

    assert not PendingExtraction.objects.filter(owner=alex).exists()
    attempt = ExtractionAttempt.objects.get(owner=alex)
    assert (attempt.outcome, attempt.called_model) == (Outcome.SKIPPED, True)


@pytest.mark.django_db
def test_scanning_again_does_not_ask_about_the_same_email_twice(api, alex, connected, model):
    deliver(connected, "figma-receipt")
    scan(api)

    scan(api)

    assert model.calls == 1
    assert PendingExtraction.objects.filter(owner=alex).count() == 1


@pytest.mark.django_db
def test_a_confirmed_or_discarded_email_is_not_offered_again(api, alex, connected, model):
    deliver(connected, "figma-receipt")
    scan(api)
    row = api.get(PENDING).json()["results"][0]
    api.delete(f"/api/v1/extractions/{row['id']}")

    scan(api)

    assert api.get(PENDING).json()["results"] == []


@pytest.mark.django_db
def test_unusable_model_output_becomes_a_blank_add_form(api, alex, connected, model):
    # 11 §2.8: malformed JSON -> validate, retry once, blank Add form.
    connected.deliver("odd", "Billing <b@example.com>", "Your plan", "Your plan renews monthly.")

    scan(api)

    row = api.get(PENDING).json()["results"][0]
    assert all(value is None for value in row["fields"].values())
    assert "price" in row["flagged"]
    assert row["source"]["subject"] == "Your plan"


@pytest.mark.django_db
def test_with_the_model_down_the_scan_stops_and_leaves_the_emails_for_later(
    api, alex, connected, model
):
    deliver(connected, "figma-receipt", "notion-yearly")
    model.error = llm.LLMUnavailable("down")

    scan(api)

    assert model.calls == 1  # stopped at the first failure, not one per email
    assert not ExtractionAttempt.objects.filter(owner=alex).exists()
    model.error = None
    scan(api)
    assert PendingExtraction.objects.filter(owner=alex).count() == 2


@pytest.mark.django_db
def test_the_cap_stops_a_scan_part_way(api, alex, connected, model, settings):
    settings.EXTRACTION_DAILY_CAP = 1
    deliver(connected, "figma-receipt", "notion-yearly")

    reviews.run_scan(alex)

    assert model.calls == 1
    assert ExtractionAttempt.objects.filter(owner=alex).count() == 1


@pytest.mark.django_db
def test_gmail_failing_mid_search_ends_the_scan_quietly(alex, connected, model):
    connected.search_status = 500

    assert reviews.run_scan(alex) == 0
    assert cache.get(f"extraction:scanning:{alex.pk}") is None


@pytest.mark.django_db
def test_a_grant_revoked_since_connecting_ends_the_scan_and_asks_to_reconnect(
    alex, connected, model
):
    connected.refresh_revoked = True

    assert reviews.run_scan(alex) == 0
    assert GmailConnection.objects.get(user=alex).revoked_at is not None


@pytest.mark.django_db
def test_an_email_gmail_cannot_return_is_passed_over(alex, connected, model):
    deliver(connected, "figma-receipt")
    # "gone" is in the search results but Gmail answers 404 for it.
    with mock.patch("extraction.gmail.search", return_value=["gone", "figma-receipt"]):
        assert reviews.run_scan(alex) == 1


@pytest.mark.django_db
def test_a_scan_task_for_a_deleted_user_does_nothing(db):
    from extraction.tasks import scan_inbox

    assert scan_inbox("6a0c00000000000000000099") == 0


# Retention (11 §2.9) -------------------------------------------------------------------------


def test_the_snippet_is_at_most_three_hundred_characters():
    long = "word " * 200

    cut = reviews.snippet(long)

    assert len(cut) <= 300
    assert cut.endswith("…")


def test_a_short_email_is_quoted_whole():
    assert reviews.snippet("Your trial ends Oct 19.") == "Your trial ends Oct 19."


@pytest.mark.django_db
def test_no_part_of_an_email_past_the_snippet_is_stored(api, alex, connected, model):
    tail = "THE-REST-OF-THE-EMAIL"
    text = fixture_email("figma-receipt")[2] + " " + "filler " * 60 + tail
    model.answers[text] = model.answers[fixture_email("figma-receipt")[2]]
    connected.deliver("long", "Figma <billing@figma.com>", "Your Figma receipt", text)

    scan(api)

    row = PendingExtraction.objects.get(owner=alex)
    assert tail not in str(row.__dict__)
    assert len(row.snippet) <= 300


def test_the_message_hash_is_per_user():
    alex, jordan = mock.Mock(pk="a"), mock.Mock(pk="b")

    assert reviews.message_hash(alex, "m1") != reviews.message_hash(jordan, "m1")


# The review queue ---------------------------------------------------------------------------------


@pytest.mark.django_db
def test_the_queue_is_the_callers_own(api, alex, connected, model, other):
    deliver(connected, "figma-receipt")
    scan(api)
    _, other_client = other

    assert len(api.get(PENDING).json()["results"]) == 1
    assert other_client.get(PENDING).json()["results"] == []


@pytest.mark.django_db
def test_an_expired_review_is_not_shown_even_before_the_ttl_monitor_runs(
    api, alex, connected, model
):
    deliver(connected, "figma-receipt")
    scan(api)
    PendingExtraction.objects.update(expires_at=timezone.now() - timedelta(seconds=1))

    assert api.get(PENDING).json()["results"] == []


def confirm_body(row):
    fields = row["fields"]
    return {
        "name": fields["service_name"],
        "billing_price": fields["price"],
        "billing_currency": fields["currency"],
        "billing_cycle": fields["billing_cycle"],
        "start_date": fields["start_date"],
        "category": fields["category"],
    }


@pytest.mark.django_db
def test_confirm_and_track_creates_the_subscription_and_forgets_the_email(
    api, alex, connected, model, contract
):
    deliver(connected, "figma-receipt")
    scan(api)
    row = api.get(PENDING).json()["results"][0]

    response = api.post(
        f"/api/v1/extractions/{row['id']}/confirm", confirm_body(row), format="json"
    )

    body = contract(response, "/extractions/{extraction_id}/confirm")
    assert response.status_code == 201
    assert body["name"] == "Figma"
    assert Subscription.objects.filter(owner=alex, name="Figma").exists()
    # 11 §2.9: the snippet goes; only the hash of the message stays.
    assert not PendingExtraction.objects.filter(owner=alex).exists()
    assert ExtractionAttempt.objects.get(owner=alex).outcome == Outcome.CONFIRMED


@pytest.mark.django_db
def test_a_confirm_that_fails_validation_keeps_the_review(api, alex, connected, model):
    deliver(connected, "figma-receipt")
    scan(api)
    row = api.get(PENDING).json()["results"][0]

    response = api.post(f"/api/v1/extractions/{row['id']}/confirm", {"name": "Figma"})

    assert response.status_code == 400
    assert PendingExtraction.objects.filter(owner=alex).count() == 1


@pytest.mark.django_db
def test_someone_elses_review_is_not_found_and_not_created(api, alex, connected, model, other):
    deliver(connected, "figma-receipt")
    scan(api)
    row = api.get(PENDING).json()["results"][0]
    _, other_client = other

    confirm = other_client.post(
        f"/api/v1/extractions/{row['id']}/confirm", confirm_body(row), format="json"
    )
    discard = other_client.delete(f"/api/v1/extractions/{row['id']}")

    assert confirm.status_code == discard.status_code == 404
    assert not Subscription.objects.filter(name="Figma").exists()
    assert PendingExtraction.objects.filter(owner=alex).count() == 1


@pytest.mark.django_db
def test_discard_deletes_the_review_and_its_snippet(api, alex, connected, model, contract):
    deliver(connected, "figma-receipt")
    scan(api)
    row = api.get(PENDING).json()["results"][0]

    response = api.delete(f"/api/v1/extractions/{row['id']}")

    assert response.status_code == 204
    contract(response, "/extractions/{extraction_id}")
    assert not PendingExtraction.objects.filter(owner=alex).exists()
    assert ExtractionAttempt.objects.get(owner=alex).outcome == Outcome.DISCARDED


@pytest.mark.django_db
@pytest.mark.parametrize(("method", "path"), [("post", SCAN), ("get", PENDING)])
def test_the_scan_endpoints_need_a_token(db, method, path):
    assert getattr(APIClient(), method)(path).status_code == 401


# Health -------------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_health_reports_the_model_circuit(client, settings):
    settings.LLM_API_KEY = None

    assert client.get("/api/v1/health/").json()["llm"] == circuit.UNCONFIGURED


# gmail_check --------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_gmail_check_needs_live(alex):
    with pytest.raises(CommandError, match="--live"):
        call_command("gmail_check", "--email", alex.email)


@pytest.mark.django_db
def test_gmail_check_names_an_unknown_account(db):
    with pytest.raises(CommandError, match="No SubTrak account"):
        call_command("gmail_check", "--email", "nobody@example.com", "--live")


@pytest.mark.django_db
def test_gmail_check_says_when_gmail_is_not_connected(alex, google):
    with pytest.raises(CommandError, match="Connect Gmail"):
        call_command("gmail_check", "--email", alex.email, "--live")


@pytest.mark.django_db
def test_gmail_check_prints_counts_never_content(alex, connected, model, capsys):
    deliver(connected, "hulu-trial", "figma-receipt")

    call_command("gmail_check", "--email", alex.email, "--live", "--scan")

    out = capsys.readouterr().out
    assert "Matches:   2" in out
    assert "Queued 2 for review" in out
    assert "17.99" not in out and "Hulu" not in out
