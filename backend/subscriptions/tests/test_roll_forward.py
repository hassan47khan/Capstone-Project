"""Rolling next_bill_date forward once a bill has passed, so renewal reminders
keep coming without anyone editing the subscription (spec section 8)."""

from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from django.conf import settings
from django.core.management import call_command
from django.utils import timezone

from accounts.models import User, settings_for
from notifications.models import Reminder
from notifications.scheduling import dedupe_key
from subscriptions import operations
from subscriptions.models import Subscription
from subscriptions.tasks import roll_forward_renewals

START = date(2026, 1, 12)
LATER = date(2026, 10, 1)

Kind = Reminder.Kind
State = Reminder.State


@pytest.fixture
def owner(db, categories):
    return User.objects.create_user(email="owner@example.com", password="x")


@pytest.fixture
def make(owner, categories):
    def make(*, today=START, **fields):
        defaults = {
            "owner": owner,
            "name": "Figma",
            "billing_price": Decimal("15.00"),
            "start_date": START,
            "category": categories["productivity"],
        }
        return operations.create_subscription(today=today, **{**defaults, **fields})

    return make


@pytest.mark.parametrize(
    ("cycle", "expected"),
    [
        ("weekly", date(2026, 10, 5)),
        ("monthly", date(2026, 10, 12)),
        ("quarterly", date(2026, 10, 12)),
        ("yearly", date(2027, 1, 12)),
    ],
)
def test_a_passed_bill_moves_to_the_next_one_on_its_cycle(make, cycle, expected):
    sub = make(billing_cycle=cycle)
    assert sub.next_bill_date == START

    assert operations.roll_forward_bills(today=LATER) == 1

    sub.refresh_from_db()
    assert sub.next_bill_date == expected


def test_a_custom_cycle_moves_too(make):
    sub = make(billing_cycle="custom", custom_cycle_count=2, custom_cycle_unit="weeks")

    operations.roll_forward_bills(today=date(2026, 1, 27))

    sub.refresh_from_db()
    assert sub.next_bill_date == date(2026, 2, 9)


def test_several_missed_bills_land_on_the_next_future_one_not_the_next_missed(make):
    sub = make()

    # A worker down since January: nine bills have gone by.
    operations.roll_forward_bills(today=LATER)

    sub.refresh_from_db()
    assert sub.next_bill_date == date(2026, 10, 12)


def test_a_cycle_change_in_the_history_is_respected(make):
    sub = make()
    operations.update_subscription(
        sub,
        today=date(2026, 3, 1),
        at=operations.at_start_of(date(2026, 3, 1)),
        billing_cycle="yearly",
    )
    expected = sub.next_bill_date

    operations.roll_forward_bills(today=expected.replace(day=expected.day + 1))

    sub.refresh_from_db()
    assert sub.next_bill_date.year == expected.year + 1


def test_running_it_twice_changes_nothing_the_second_time(make):
    sub = make()
    assert operations.roll_forward_bills(today=LATER) == 1
    sub.refresh_from_db()
    rows = list(Reminder.objects.filter(subscription=sub).values("pk", "state", "due_at"))
    bill = sub.next_bill_date

    assert operations.roll_forward_bills(today=LATER) == 0

    sub.refresh_from_db()
    assert sub.next_bill_date == bill
    assert list(Reminder.objects.filter(subscription=sub).values("pk", "state", "due_at")) == rows


def test_a_bill_due_today_or_later_is_left_alone(make):
    due_today = make(name="Today", today=LATER, start_date=LATER)
    upcoming = make(name="Upcoming", today=LATER, start_date=date(2026, 12, 25))
    rows = Reminder.objects.count()

    assert operations.roll_forward_bills(today=LATER) == 0

    due_today.refresh_from_db()
    upcoming.refresh_from_db()
    assert due_today.next_bill_date == LATER
    assert upcoming.next_bill_date == date(2026, 12, 25)
    assert Reminder.objects.count() == rows


def test_a_trial_is_skipped(make):
    # Trials have no bill until they convert (04 §6a).
    sub = make(is_trial=True, trial_ends_on=START, trial_length_days=30)
    before = sub.next_bill_date

    assert operations.roll_forward_bills(today=LATER) == 0

    sub.refresh_from_db()
    assert sub.next_bill_date == before


def test_a_cancelled_subscription_is_skipped(make):
    sub = make()
    operations.cancel_subscription(sub, today=START)
    # Even with a stale date left on it, cancelled means no more bills.
    Subscription.objects.filter(pk=sub.pk).update(next_bill_date=START)

    assert operations.roll_forward_bills(today=LATER) == 0

    sub.refresh_from_db()
    assert sub.next_bill_date == START


def test_a_deleted_subscription_is_skipped(make):
    sub = make()
    operations.soft_delete(sub)
    Subscription.all_objects.filter(pk=sub.pk).update(next_bill_date=START)

    assert operations.roll_forward_bills(today=LATER) == 0


def test_the_renewal_reminder_moves_to_the_new_bill(make, owner):
    sub = make(today=date(2026, 9, 1), start_date=date(2026, 9, 12))
    old = Reminder.objects.get(subscription=sub, kind=Kind.RENEWAL)

    operations.roll_forward_bills(today=LATER)

    old.refresh_from_db()
    assert old.state == State.CANCELLED
    # 3 days before the 12 October bill, the rule's default.
    key = dedupe_key(sub.pk, Kind.RENEWAL, date(2026, 10, 9))
    assert Reminder.objects.get(dedupe_key=key).state == State.PENDING


def test_a_reminder_already_sent_stays_as_history(make):
    sub = make(today=date(2026, 9, 1), start_date=date(2026, 9, 12))
    Reminder.objects.filter(subscription=sub).update(state=State.SENT)

    operations.roll_forward_bills(today=LATER)

    states = sorted(Reminder.objects.filter(subscription=sub).values_list("state", flat=True))
    assert states == [State.PENDING, State.SENT]


def test_each_user_is_rolled_on_their_own_local_date(
    make, owner, categories, settings, monkeypatch
):
    settings.SUBTRAK_TODAY = None
    # 02:00 UTC on the 13th: still the 12th in New York, already the 13th in Tokyo.
    monkeypatch.setattr(timezone, "now", lambda: datetime(2026, 10, 13, 2, tzinfo=UTC))
    tokyo_user = User.objects.create_user(email="tokyo@example.com", password="x")
    for user, zone in ((owner, "America/New_York"), (tokyo_user, "Asia/Tokyo")):
        prefs = settings_for(user)
        prefs.timezone = zone
        prefs.save(update_fields=["timezone"])
    new_york = make(name="NY", today=LATER)
    tokyo = make(name="Tokyo", today=LATER, owner=tokyo_user)

    assert operations.roll_forward_bills() == 1

    new_york.refresh_from_db()
    tokyo.refresh_from_db()
    assert new_york.next_bill_date == date(2026, 10, 12)  # a bill due today is still upcoming
    assert tokyo.next_bill_date == date(2026, 11, 12)


def test_one_bad_subscription_does_not_stop_the_others(make, monkeypatch, caplog):
    bad = make(name="Bad")
    good = make(name="Good")
    real = operations.reschedule_for_subscription

    def fails_for_bad(sub, **kwargs):
        if sub.pk == bad.pk:
            raise RuntimeError("boom")
        return real(sub, **kwargs)

    monkeypatch.setattr(operations, "reschedule_for_subscription", fails_for_bad)

    assert operations.roll_forward_bills(today=LATER) == 1

    bad.refresh_from_db()
    good.refresh_from_db()
    assert bad.next_bill_date == START  # rolled back with its failed reminders
    assert good.next_bill_date == date(2026, 10, 12)
    assert str(bad.pk) in caplog.text


def test_the_task_takes_an_iso_date_because_the_only_serializer_is_json(make):
    sub = make()

    assert roll_forward_renewals(LATER.isoformat()) == 1

    sub.refresh_from_db()
    assert sub.next_bill_date == date(2026, 10, 12)


def test_unset_the_task_uses_each_users_date(make, settings):
    settings.SUBTRAK_TODAY = LATER
    make()

    assert roll_forward_renewals() == 1


def test_the_command_runs_the_same_code_as_the_task(make, capsys):
    sub = make()

    call_command("roll_forward_renewals", f"--today={LATER.isoformat()}")

    sub.refresh_from_db()
    assert sub.next_bill_date == date(2026, 10, 12)
    assert "Rolled 1 subscription(s) forward." in capsys.readouterr().out


def test_it_runs_daily_in_the_quiet_hours():
    schedule = settings.CELERY_BEAT_SCHEDULE["roll-forward-renewals"]["schedule"]

    assert schedule.hour == {3}
    assert schedule.minute == {0}
