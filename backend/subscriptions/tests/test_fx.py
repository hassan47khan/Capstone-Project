"""Exchange rates from Frankfurter (phase 3, spec section 12, handoff 09 §2).

Every case here maps or stores the saved fixture, which is a real response
trimmed to the interesting rows. Nothing touches the network: `fetch_rates`
refuses to make a live call under pytest unless a transport is injected.
"""

import json
import logging
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

import httpx
import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from subscriptions import fx, seed
from subscriptions.models import FxRate
from subscriptions.tasks import refresh_exchange_rates

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "frankfurter_rates.json"
BODY = FIXTURE.read_text(encoding="utf-8")


def transport(body=BODY, status=200):
    return httpx.MockTransport(lambda request: httpx.Response(status, text=body))


# Parsing -----------------------------------------------------------------------


def test_the_v2_response_is_a_flat_array_of_quotes():
    quotes = {q.currency: q for q in fx.parse_rates(BODY)}

    assert quotes["EUR"].rate == Decimal("0.89619")
    assert quotes["GBP"].rate == Decimal("0.75097")


def test_rates_keep_every_digit_the_provider_sent():
    # The whole reason parse_rates reads the text instead of response.json():
    # float(0.89619) is 0.89618999999999995, and this value is multiplied by
    # money in a DecimalField.
    eur = next(q for q in fx.parse_rates(BODY) if q.currency == "EUR")

    assert eur.rate == Decimal("0.89619")
    assert str(eur.rate) == "0.89619"
    assert eur.rate != Decimal(0.89619)  # noqa: B015 - the float, deliberately


def test_a_rate_finer_than_a_float_survives_intact():
    # Decimal(str(float(x))) happens to recover these five-figure rates, so
    # only a value beyond a float's precision shows why parse_float=Decimal
    # is there rather than a str() round-trip.
    precise = (
        '[{"date": "2026-10-29", "base": "USD", "quote": "EUR", "rate": 0.12345678901234567890123}]'
    )

    assert fx.parse_rates(precise)[0].rate == Decimal("0.12345678901234567890123")


def test_a_whole_number_rate_is_still_a_decimal():
    jpy = next(q for q in fx.parse_rates(BODY) if q.currency == "JPY")

    assert isinstance(jpy.rate, Decimal)
    assert jpy.rate == Decimal("158.0")


def test_each_quote_keeps_its_own_date():
    # A real response mixes days: thinly traded quotes lag, so one timestamp
    # for the batch would be wrong. The saved response does carry a lagging
    # row (ANG, a day behind), but ANG is filtered out, so this moves a
    # supported currency back to make the same point.
    rows = json.loads(BODY)
    for row in rows:
        if row["quote"] == "CHF":
            row["date"] = "2026-10-27"

    quotes = {q.currency: q for q in fx.parse_rates(json.dumps(rows))}

    assert quotes["CHF"].as_of == date(2026, 10, 27)
    assert quotes["EUR"].as_of == date(2026, 10, 29)


def test_a_lagging_quote_is_stored_with_its_own_older_date(db, categories):
    rows = json.loads(BODY)
    for row in rows:
        if row["quote"] == "CHF":
            row["date"] = "2026-10-27"

    fx.store_rates(fx.parse_rates(json.dumps(rows)))

    assert FxRate.objects.get(currency="CHF").as_of == datetime(2026, 10, 27, tzinfo=UTC)
    assert FxRate.objects.get(currency="EUR").as_of == datetime(2026, 10, 29, tzinfo=UTC)


def test_crypto_metals_and_other_unsupported_codes_are_dropped():
    stored = {q.currency for q in fx.parse_rates(BODY)}

    # All present in the fixture, all deliberately not money SubTrak prices in.
    assert not stored & {"BTC", "XAU", "XDR", "ANG"}


def test_the_base_currency_needs_no_stored_rate():
    # operations._rates() supplies USD -> 1 itself.
    assert "USD" not in {q.currency for q in fx.parse_rates(BODY)}


def test_only_the_supported_set_is_kept():
    assert {q.currency for q in fx.parse_rates(BODY)} == set(fx.SUPPORTED_CURRENCIES) - {"USD"}


# Fetching ----------------------------------------------------------------------


def test_a_fetch_gives_up_after_the_ten_seconds_section_12_allows():
    assert fx.TIMEOUT_SECONDS == 10


def test_the_suite_cannot_call_frankfurter_for_real():
    with pytest.raises(RuntimeError, match="Tests must pass a transport"):
        fx.fetch_rates()


def test_a_fetch_asks_for_rates_against_usd():
    seen = []

    def handle(request):
        seen.append(request.url)
        return httpx.Response(200, text=BODY)

    fx.fetch_rates(transport=httpx.MockTransport(handle))

    assert str(seen[0]) == "https://api.frankfurter.dev/v2/rates?base=usd"


def test_a_server_error_is_raised_so_the_caller_can_keep_what_it_has():
    with pytest.raises(httpx.HTTPStatusError):
        fx.fetch_rates(transport=transport(body="nope", status=503))


# Storing -----------------------------------------------------------------------


@pytest.mark.django_db
def test_rates_are_stored_as_exact_decimals(categories):
    fx.store_rates(fx.parse_rates(BODY))

    assert FxRate.objects.get(currency="EUR").rate == Decimal("0.89619")


@pytest.mark.django_db
def test_the_source_date_is_stored_as_the_as_of(categories):
    fx.store_rates(fx.parse_rates(BODY))

    assert FxRate.objects.get(currency="EUR").as_of == datetime(2026, 10, 29, tzinfo=UTC)


@pytest.mark.django_db
def test_storing_twice_updates_rather_than_duplicates(categories):
    fx.store_rates(fx.parse_rates(BODY))
    first = FxRate.objects.count()

    moved = json.loads(BODY)
    for row in moved:
        if row["quote"] == "EUR":
            row["rate"] = 0.9
    fx.store_rates(fx.parse_rates(json.dumps(moved)))

    assert FxRate.objects.count() == first
    assert FxRate.objects.get(currency="EUR").rate == Decimal("0.9")


@pytest.mark.django_db
def test_a_currency_missing_from_a_response_keeps_its_last_rate(categories):
    fx.store_rates(fx.parse_rates(BODY))
    without_gbp = [r for r in json.loads(BODY) if r["quote"] != "GBP"]

    fx.store_rates(fx.parse_rates(json.dumps(without_gbp)))

    # Dropping it would take every GBP subscription out of everyone's totals.
    assert FxRate.objects.get(currency="GBP").rate == Decimal("0.75097")


# The task and its fallback ------------------------------------------------------


@pytest.mark.django_db
def test_the_task_stores_what_it_fetched(categories, monkeypatch):
    monkeypatch.setattr(fx, "fetch_rates", lambda **kw: fx.parse_rates(BODY))

    assert refresh_exchange_rates() == len(fx.SUPPORTED_CURRENCIES) - 1
    assert FxRate.objects.get(currency="CAD").rate == Decimal("1.4013")


@pytest.mark.django_db
def test_a_failed_refresh_keeps_the_rates_already_stored(categories, monkeypatch, caplog):
    fx.store_rates(fx.parse_rates(BODY))
    monkeypatch.setattr(
        fx, "fetch_rates", lambda **kw: (_ for _ in ()).throw(httpx.ConnectTimeout("down"))
    )

    with caplog.at_level(logging.WARNING), pytest.raises(httpx.ConnectTimeout):
        refresh_exchange_rates()

    # Section 12: keep the last stored rates and show their date.
    assert FxRate.objects.get(currency="EUR").rate == Decimal("0.89619")


def test_the_refresh_gets_three_retries_across_the_day():
    assert refresh_exchange_rates.max_retries == 3
    assert refresh_exchange_rates.retry_backoff >= 3600


# Keeping the seeded figures safe -------------------------------------------------


@pytest.mark.django_db
def test_seed_demo_never_calls_the_provider(monkeypatch):
    def explode(**kwargs):
        raise AssertionError("seed_demo must not fetch live rates")

    monkeypatch.setattr(fx, "fetch_rates", explode)

    call_command("seed_demo", f"--today={seed.SEED_TODAY.isoformat()}")


@pytest.mark.django_db
def test_seed_demo_restores_the_fixed_rate_the_canonical_figures_need(monkeypatch):
    # Alex's €118.56 (04 §4) is computed from EUR 0.9177 exactly.
    fx.store_rates(fx.parse_rates(BODY))
    assert FxRate.objects.get(currency="EUR").rate == Decimal("0.89619")

    call_command("seed_demo", f"--today={seed.SEED_TODAY.isoformat()}")

    assert FxRate.objects.get(currency="EUR").rate == Decimal("0.9177")


# The management command ----------------------------------------------------------


def test_refresh_rates_refuses_without_live():
    with pytest.raises(CommandError, match="--live"):
        call_command("refresh_rates")


@pytest.mark.django_db
def test_refresh_rates_live_stores_the_rates(monkeypatch, capsys):
    monkeypatch.setattr(fx, "refresh", lambda: store_fixture())

    call_command("refresh_rates", "--live")

    assert "Stored 10 rate(s)." in capsys.readouterr().out
    assert FxRate.objects.get(currency="EUR").rate == Decimal("0.89619")


@pytest.mark.django_db
def test_refresh_rates_live_says_the_stored_rates_are_kept(monkeypatch):
    def down():
        raise httpx.ConnectTimeout("no route")

    monkeypatch.setattr(fx, "refresh", down)

    with pytest.raises(CommandError, match="keeping the stored rates"):
        call_command("refresh_rates", "--live")


def store_fixture() -> int:
    return fx.store_rates(fx.parse_rates(BODY))


# What the app shows for them ------------------------------------------------------


@pytest.mark.django_db
def test_analytics_reports_the_stored_as_of(api, alex):
    # Handoff 09 §2's footer promises "updated {date}", so the date the
    # screen shows has to be the one the rates were actually fetched for.
    assert api.get("/api/v1/analytics/summary").json()["rates_as_of"] == str(seed.SEED_TODAY)

    fx.store_rates(fx.parse_rates(BODY))

    assert api.get("/api/v1/analytics/summary").json()["rates_as_of"] == "2026-10-29"


def test_rates_refresh_daily_at_two_in_the_morning_utc(settings):
    schedule = settings.CELERY_BEAT_SCHEDULE["refresh-exchange-rates"]["schedule"]

    assert schedule.hour == {2}
    assert schedule.minute == {0}
