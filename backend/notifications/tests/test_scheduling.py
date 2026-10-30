"""Which reminders a user should have, and keeping them in step (spec §8).

The two rules worth breaking on purpose are here: wall-clock time survives a
DST change (US-5), and rescheduling upserts by `dedupe_key` so an edit leaves
one row per alert rather than a new one each time.
"""

from datetime import UTC, date, datetime, time, timedelta

import pytest

from accounts.models import rules_for, settings_for
from notifications.models import Reminder
from notifications.scheduling import (
    dedupe_key,
    reschedule_for_subscription,
    reschedule_for_user,
    wanted_for,
)
from subscriptions.models import Subscription
from subscriptions.seed import SEED_TODAY

Kind = Reminder.Kind
State = Reminder.State

# Well before any date under test, so nothing is clamped to "due now".
EARLY = datetime(2026, 1, 1, tzinfo=UTC)


def set_zone(user, name):
    prefs = settings_for(user)
    prefs.timezone = name
    prefs.save(update_fields=["timezone"])


def set_rules(user, **changes):
    rules = rules_for(user)
    for field, value in changes.items():
        setattr(rules, field, value)
    rules.save()
    return rules


@pytest.fixture
def renewing(alex):
    """One of Alex's ordinary subscriptions, billing on a known date."""
    sub = Subscription.objects.filter(owner=alex, is_trial=False).first()
    sub.next_bill_date = date(2026, 11, 5)
    sub.save(update_fields=["next_bill_date"])
    return sub


@pytest.fixture
def trialling(alex):
    sub = Subscription.objects.filter(owner=alex, is_trial=True).first()
    sub.trial_ends_on = date(2026, 11, 5)
    sub.trial_reminder_enabled = True
    sub.save(update_fields=["trial_ends_on", "trial_reminder_enabled"])
    return sub


def reminders(sub, state=None):
    rows = Reminder.objects.filter(subscription=sub)
    return list(rows.filter(state=state) if state else rows)


# Daylight saving (US-5) -----------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("bill_on", "expected"),
    [
        # Clocks go back on 2026-11-01. 09:00 in New York is 13:00 UTC before
        # it and 14:00 UTC after, so a fixed UTC offset would send one of
        # these an hour wrong.
        (date(2026, 11, 3), datetime(2026, 10, 31, 13, 0, tzinfo=UTC)),
        (date(2026, 11, 5), datetime(2026, 11, 2, 14, 0, tzinfo=UTC)),
        # Clocks go forward on 2027-03-14.
        (date(2027, 3, 16), datetime(2027, 3, 13, 14, 0, tzinfo=UTC)),
        (date(2027, 3, 18), datetime(2027, 3, 15, 13, 0, tzinfo=UTC)),
    ],
)
def test_a_reminder_keeps_its_local_hour_across_a_dst_change(alex, renewing, bill_on, expected):
    set_zone(alex, "America/New_York")
    set_rules(alex, days_before_reminder=3, reminder_time=time(9, 0))
    renewing.next_bill_date = bill_on
    renewing.save(update_fields=["next_bill_date"])

    wanted = wanted_for(renewing, today=date(2026, 10, 1), now=EARLY)

    assert wanted[0].due_at == expected


@pytest.mark.django_db
def test_a_user_with_no_time_zone_is_scheduled_as_utc_and_flagged(alex, renewing):
    set_zone(alex, "")
    set_rules(alex, days_before_reminder=3, reminder_time=time(9, 0))

    wanted = wanted_for(renewing, today=date(2026, 10, 1), now=EARLY)

    assert wanted[0].due_at == datetime(2026, 11, 2, 9, 0, tzinfo=UTC)
    # The body has to say so (spec section 8), so the flag has to survive.
    assert wanted[0].timezone_flagged is True


@pytest.mark.django_db
def test_the_flag_is_stored_on_the_reminder(alex, renewing):
    set_zone(alex, "")

    reschedule_for_subscription(renewing, today=date(2026, 10, 1), now=EARLY)

    assert reminders(renewing)[0].timezone_flagged is True


# What is wanted ---------------------------------------------------------------------


@pytest.mark.django_db
def test_a_renewal_is_scheduled_the_configured_days_before_the_bill(alex, renewing):
    set_zone(alex, "UTC")
    set_rules(alex, days_before_reminder=5)

    wanted = wanted_for(renewing, today=date(2026, 10, 1), now=EARLY)

    assert [w.kind for w in wanted] == [Kind.RENEWAL]
    assert wanted[0].target_date == date(2026, 10, 31)


@pytest.mark.django_db
def test_a_trial_uses_its_own_lead_time_not_the_billing_one(alex, trialling):
    set_zone(alex, "UTC")
    set_rules(alex, days_before_reminder=5, trial_alert_days_before=2)

    wanted = wanted_for(trialling, today=date(2026, 10, 1), now=EARLY)

    # Handoff 09 §5 gives trials their own stepper, so the billing lead time
    # must not leak into them.
    assert [w.kind for w in wanted] == [Kind.TRIAL_ENDING]
    assert wanted[0].target_date == date(2026, 11, 3)


@pytest.mark.django_db
def test_a_trial_has_no_renewal_reminder(alex, trialling):
    # A trial has no bill until it converts (04 §6a).
    assert [w.kind for w in wanted_for(trialling, today=SEED_TODAY, now=EARLY)] == [
        Kind.TRIAL_ENDING
    ]


@pytest.mark.django_db
def test_turning_trial_reminders_off_wants_nothing(alex, trialling):
    trialling.trial_reminder_enabled = False
    trialling.save(update_fields=["trial_reminder_enabled"])

    assert wanted_for(trialling, today=SEED_TODAY, now=EARLY) == []


@pytest.mark.django_db
@pytest.mark.parametrize("status", [Subscription.Status.CANCELLED, Subscription.Status.DELETED])
def test_a_subscription_that_is_not_active_wants_nothing(alex, renewing, status):
    renewing.status = status
    renewing.save(update_fields=["status"])

    assert wanted_for(renewing, today=date(2026, 10, 1), now=EARLY) == []


# "Reminder due now" (handoff 11 §2.4) ------------------------------------------------


@pytest.mark.django_db
def test_a_reminder_whose_moment_has_passed_is_due_now(alex, trialling):
    set_zone(alex, "UTC")
    # A trial ending in 2 days with a 3-day lead: the reminder date is
    # yesterday, so it has to go out now rather than sit in the past where
    # the dispatcher's window would never reach it.
    set_rules(alex, trial_alert_days_before=3)
    trialling.trial_ends_on = date(2026, 11, 5)
    trialling.save(update_fields=["trial_ends_on"])
    now = datetime(2026, 11, 3, 15, 30, tzinfo=UTC)

    wanted = wanted_for(trialling, today=date(2026, 11, 3), now=now)

    assert wanted[0].target_date == date(2026, 11, 2)
    assert wanted[0].due_at == now


@pytest.mark.django_db
def test_a_future_reminder_is_not_dragged_forward(alex, renewing):
    set_zone(alex, "UTC")
    set_rules(alex, days_before_reminder=3, reminder_time=time(9, 0))
    now = datetime(2026, 10, 1, 15, 30, tzinfo=UTC)

    wanted = wanted_for(renewing, today=date(2026, 10, 1), now=now)

    assert wanted[0].due_at == datetime(2026, 11, 2, 9, 0, tzinfo=UTC)


# Rescheduling ------------------------------------------------------------------------


@pytest.mark.django_db
def test_rescheduling_writes_one_row_per_alert(alex, renewing):
    reschedule_for_subscription(renewing, today=date(2026, 10, 1), now=EARLY)

    live = reminders(renewing, State.PENDING)
    assert len(live) == 1
    assert live[0].dedupe_key == dedupe_key(renewing.pk, Kind.RENEWAL, date(2026, 11, 2))


@pytest.mark.django_db
def test_rescheduling_twice_updates_rather_than_duplicating(alex, renewing):
    reschedule_for_subscription(renewing, today=date(2026, 10, 1), now=EARLY)
    after_one = {r.dedupe_key for r in reminders(renewing)}

    reschedule_for_subscription(renewing, today=date(2026, 10, 1), now=EARLY)

    # No new row: the second pass upserts the one the first wrote.
    assert {r.dedupe_key for r in reminders(renewing)} == after_one
    assert len(reminders(renewing, State.PENDING)) == 1


@pytest.mark.django_db
def test_moving_the_bill_date_cancels_the_reminder_that_no_longer_applies(alex, renewing):
    reschedule_for_subscription(renewing, today=date(2026, 10, 1), now=EARLY)
    original = reminders(renewing)[0].dedupe_key

    renewing.next_bill_date = date(2026, 12, 5)
    renewing.save(update_fields=["next_bill_date"])
    reschedule_for_subscription(renewing, today=date(2026, 10, 1), now=EARLY)

    # The old row is cancelled, not deleted, and not left pending to fire.
    assert Reminder.objects.get(dedupe_key=original).state == State.CANCELLED
    assert len(reminders(renewing, State.PENDING)) == 1


@pytest.mark.django_db
def test_a_sent_reminder_is_never_cancelled_by_a_later_edit(alex, renewing):
    reschedule_for_subscription(renewing, today=date(2026, 10, 1), now=EARLY)
    sent = reminders(renewing, State.PENDING)[0]
    sent.state = State.SENT
    sent.save(update_fields=["state"])

    renewing.next_bill_date = date(2026, 12, 5)
    renewing.save(update_fields=["next_bill_date"])
    reschedule_for_subscription(renewing, today=date(2026, 10, 1), now=EARLY)

    # It already happened; rewriting history would be a lie.
    sent.refresh_from_db()
    assert sent.state == State.SENT


@pytest.mark.django_db
def test_a_failed_reminder_gets_another_go_when_the_schedule_moves(alex, renewing):
    reschedule_for_subscription(renewing, today=date(2026, 10, 1), now=EARLY)
    row = reminders(renewing, State.PENDING)[0]
    row.state, row.attempts = State.FAILED, 3
    row.save(update_fields=["state", "attempts"])

    reschedule_for_subscription(renewing, today=date(2026, 10, 1), now=EARLY)

    row.refresh_from_db()
    assert row.state == State.PENDING
    assert row.attempts == 0


@pytest.mark.django_db
def test_changing_the_lead_time_reschedules_every_subscription(alex):
    set_zone(alex, "UTC")
    reschedule_for_user(alex, today=SEED_TODAY, now=EARLY)
    before = set(Reminder.objects.filter(state=State.PENDING).values_list("dedupe_key", flat=True))

    set_rules(alex, days_before_reminder=10)
    reschedule_for_user(alex, today=SEED_TODAY, now=EARLY)
    after = set(Reminder.objects.filter(state=State.PENDING).values_list("dedupe_key", flat=True))

    assert before and after and before != after
    assert all(r.state == State.CANCELLED for r in Reminder.objects.exclude(dedupe_key__in=after))


# The lifecycle hooks ------------------------------------------------------------------


@pytest.mark.django_db
def test_creating_a_subscription_schedules_its_renewal(alex, categories):
    from subscriptions import operations

    sub = operations.create_subscription(
        today=SEED_TODAY,
        owner=alex,
        name="Figma",
        billing_price="15.00",
        billing_currency="USD",
        billing_cycle="monthly",
        start_date=SEED_TODAY,
        category=categories["productivity"],
    )

    assert [r.kind for r in reminders(sub, State.PENDING)] == [Kind.RENEWAL]


@pytest.mark.django_db
def test_cancelling_a_subscription_stops_its_reminders(alex, renewing):
    from subscriptions import operations

    reschedule_for_subscription(renewing, today=SEED_TODAY, now=EARLY)
    assert reminders(renewing, State.PENDING)

    operations.cancel_subscription(renewing, today=SEED_TODAY)

    assert reminders(renewing, State.PENDING) == []


@pytest.mark.django_db
def test_deleting_then_restoring_puts_the_reminders_back(alex, renewing):
    from subscriptions import operations

    operations.soft_delete(renewing)
    assert reminders(renewing, State.PENDING) == []

    operations.restore(renewing, today=SEED_TODAY)

    assert reminders(renewing, State.PENDING)


@pytest.mark.django_db
def test_editing_a_subscription_moves_its_reminder(alex, renewing):
    from subscriptions import operations

    reschedule_for_subscription(renewing, today=SEED_TODAY, now=EARLY)
    before = reminders(renewing, State.PENDING)[0].due_at

    operations.update_subscription(
        renewing, today=SEED_TODAY, next_bill_date=renewing.next_bill_date + timedelta(days=30)
    )

    assert reminders(renewing, State.PENDING)[0].due_at != before


# Scoping ---------------------------------------------------------------------------------


@pytest.mark.django_db
def test_reminders_belong_to_the_subscriptions_owner(alex, renewing):
    reschedule_for_subscription(renewing, today=SEED_TODAY, now=EARLY)

    assert all(r.user_id == alex.pk for r in reminders(renewing))


@pytest.mark.django_db
def test_a_trial_that_already_ended_wants_nothing(alex, trialling):
    # convert_expired_trials turns it into a paying subscription; warning
    # about an ending that has been and gone would just be noise.
    trialling.trial_ends_on = date(2026, 9, 1)
    trialling.save(update_fields=["trial_ends_on"])

    assert wanted_for(trialling, today=date(2026, 10, 1), now=EARLY) == []


@pytest.mark.django_db
def test_a_bill_date_in_the_past_wants_nothing(alex, renewing):
    # refresh_next_bill_date rolls it forward; until it does, there is
    # nothing useful to say.
    renewing.next_bill_date = date(2026, 9, 1)
    renewing.save(update_fields=["next_bill_date"])

    assert wanted_for(renewing, today=date(2026, 10, 1), now=EARLY) == []


@pytest.mark.django_db
def test_the_models_describe_themselves_for_the_admin(alex, renewing):
    from notifications.models import DeviceToken, Notification

    reschedule_for_subscription(renewing, today=SEED_TODAY, now=EARLY)
    reminder = reminders(renewing, State.PENDING)[0]
    inbox = Notification.objects.create(
        user=alex, reminder=reminder, kind=Kind.RENEWAL, title="t", body="b"
    )
    device = DeviceToken.objects.create(
        user=alex, token="ExponentPushToken[x]", platform=DeviceToken.Platform.ANDROID
    )

    assert "renewal" in str(reminder)
    assert "renewal" in str(inbox)
    assert "android" in str(device)
