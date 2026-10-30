"""Delivering reminders: the state machine, the claim and the retries (§8).

Nothing here reaches Expo: every send goes through a patched `push.send`,
and the one test that exercises the HTTP client uses `httpx.MockTransport`.
"""

from datetime import timedelta
from unittest import mock

import httpx
import pytest
from django.core import mail
from django.utils import timezone

from accounts.models import rules_for
from notifications import push, tasks
from notifications.models import DeviceToken, Notification, PushReceipt, Reminder
from notifications.scheduling import reschedule_for_subscription
from subscriptions.models import Subscription
from subscriptions.seed import SEED_TODAY

State = Reminder.State
Kind = Reminder.Kind
PushStatus = Notification.PushStatus


@pytest.fixture
def reminder(alex):
    """Exactly one pending reminder of Alex's, due a minute ago.

    The seed schedules reminders for every subscription it creates, so the
    rest are cleared first; otherwise the dispatcher counts here would
    depend on the whole canonical dataset.
    """
    sub = Subscription.objects.filter(owner=alex, is_trial=False).first()
    reschedule_for_subscription(sub, today=SEED_TODAY)
    row = Reminder.objects.filter(subscription=sub, state=State.PENDING).first()
    Reminder.objects.exclude(pk=row.pk).delete()
    row.due_at = timezone.now() - timedelta(minutes=1)
    row.save(update_fields=["due_at"])
    return row


@pytest.fixture
def device(alex):
    return DeviceToken.objects.create(
        user=alex, token="ExponentPushToken[alex-1]", platform=DeviceToken.Platform.ANDROID
    )


class Retried(Exception):
    """Stands in for Celery's Retry, which a worker catches and we cannot."""


def accepted(token, receipt_id="ticket-1"):
    return push.Ticket(token=token, status="ok", receipt_id=receipt_id)


def rejected(token, error=push.DEVICE_NOT_REGISTERED):
    return push.Ticket(token=token, status="error", error=error)


def sending(**tickets_by_call):
    """Patch push.send to return the given tickets."""
    return mock.patch.object(push, "send", **tickets_by_call)


# Claiming --------------------------------------------------------------------------


@pytest.mark.django_db
def test_claiming_moves_a_reminder_from_pending_to_sending(reminder):
    assert tasks.claim(reminder.pk) is True

    reminder.refresh_from_db()
    assert reminder.state == State.SENDING


@pytest.mark.django_db
def test_two_dispatchers_racing_on_one_reminder_give_one_winner(reminder):
    # The conditional update is the whole protection against a user getting
    # the same alert twice (spec section 12).
    first = tasks.claim(reminder.pk)
    second = tasks.claim(reminder.pk)

    assert [first, second] == [True, False]


@pytest.mark.django_db
def test_a_reminder_that_is_not_pending_cannot_be_claimed(reminder):
    Reminder.objects.filter(pk=reminder.pk).update(state=State.SENT)

    assert tasks.claim(reminder.pk) is False


# Dispatching ------------------------------------------------------------------------


@pytest.mark.django_db
def test_the_dispatcher_claims_what_is_due(reminder, device):
    with sending(return_value=[accepted(device.token)]):
        result = tasks.dispatch_due_reminders()

    assert result["claimed"] == 1
    reminder.refresh_from_db()
    assert reminder.state == State.SENT


@pytest.mark.django_db
def test_a_reminder_not_yet_due_is_left_alone(reminder):
    Reminder.objects.filter(pk=reminder.pk).update(due_at=timezone.now() + timedelta(hours=1))

    assert tasks.dispatch_due_reminders()["claimed"] == 0
    reminder.refresh_from_db()
    assert reminder.state == State.PENDING


@pytest.mark.django_db
def test_a_reminder_too_old_to_matter_expires_instead_of_sending(reminder):
    # Sending a renewal warning three days after the charge is worse than
    # sending nothing (section 8).
    Reminder.objects.filter(pk=reminder.pk).update(due_at=timezone.now() - timedelta(hours=49))

    result = tasks.dispatch_due_reminders()

    reminder.refresh_from_db()
    assert (result["claimed"], result["expired"]) == (0, 1)
    assert reminder.state == State.EXPIRED


@pytest.mark.django_db
def test_a_backlog_inside_the_window_still_goes_out(reminder, device):
    Reminder.objects.filter(pk=reminder.pk).update(due_at=timezone.now() - timedelta(hours=47))

    with sending(return_value=[accepted(device.token)]):
        assert tasks.dispatch_due_reminders()["claimed"] == 1


# Delivery order and preferences --------------------------------------------------------


@pytest.mark.django_db
def test_both_channels_off_is_skipped_not_failed(reminder, alex):
    rules = rules_for(alex)
    rules.send_push, rules.send_email = False, False
    rules.save()

    tasks.claim(reminder.pk)
    assert tasks.deliver_reminder(str(reminder.pk)) == State.SKIPPED

    reminder.refresh_from_db()
    assert reminder.state == State.SKIPPED
    assert Notification.objects.count() == 0


@pytest.mark.django_db
def test_the_inbox_row_is_written_before_any_push_is_tried(reminder, alex, device):
    # Proved by failing the push: the row still has to exist afterwards.
    Reminder.objects.filter(pk=reminder.pk).update(attempts=tasks.MAX_PUSH_RETRIES)

    def explode(messages):
        assert Notification.objects.filter(reminder=reminder).exists(), (
            "the inbox row must already exist when the push is attempted"
        )
        raise httpx.ConnectTimeout("down")

    tasks.claim(reminder.pk)
    with mock.patch.object(push, "send", explode):
        tasks.deliver_reminder(str(reminder.pk))

    assert Notification.objects.filter(reminder=reminder).exists()


@pytest.mark.django_db
def test_one_reminder_can_only_produce_one_inbox_row(reminder, alex):
    tasks.ensure_notification(reminder)
    tasks.ensure_notification(reminder)

    assert Notification.objects.filter(reminder=reminder).count() == 1


@pytest.mark.django_db
def test_no_device_means_the_inbox_row_is_the_delivery(reminder, alex):
    tasks.claim(reminder.pk)

    assert tasks.deliver_reminder(str(reminder.pk)) == State.SENT

    reminder.refresh_from_db()
    # Section 8: the task ends successfully; retrying would never help.
    assert reminder.state == State.SENT
    assert Notification.objects.get(reminder=reminder).push_status == PushStatus.NO_DEVICE


@pytest.mark.django_db
def test_email_goes_out_only_when_the_user_asked_for_it(reminder, alex, device):
    rules = rules_for(alex)
    rules.send_email = True
    rules.save()

    tasks.claim(reminder.pk)
    with sending(return_value=[accepted(device.token)]):
        tasks.deliver_reminder(str(reminder.pk))

    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [alex.email]


@pytest.mark.django_db
def test_no_email_when_the_toggle_is_off(reminder, alex, device):
    assert rules_for(alex).send_email is False

    tasks.claim(reminder.pk)
    with sending(return_value=[accepted(device.token)]):
        tasks.deliver_reminder(str(reminder.pk))

    assert mail.outbox == []


# Retry and failure -----------------------------------------------------------------------


@pytest.mark.django_db
def test_a_push_failure_is_retried_with_a_growing_backoff(reminder, alex, device):
    waits = []

    def capture(countdown=None, exc=None):
        waits.append(countdown)
        return Retried()

    tasks.claim(reminder.pk)
    with (
        sending(side_effect=httpx.ConnectTimeout("down")),
        mock.patch.object(tasks.deliver_reminder, "retry", capture),
        pytest.raises(Retried),
    ):
        tasks.deliver_reminder(str(reminder.pk))

    # Section 12: roughly 1, 2, 4 minutes. This is the first of them.
    assert waits == [60]
    reminder.refresh_from_db()
    assert reminder.state == State.RETRYING


@pytest.mark.django_db
@pytest.mark.parametrize(("attempts_so_far", "expected"), [(0, 60), (1, 120), (2, 240)])
def test_the_backoff_doubles_each_attempt(reminder, alex, device, attempts_so_far, expected):
    waits = []
    Reminder.objects.filter(pk=reminder.pk).update(attempts=attempts_so_far)

    def capture(countdown=None, exc=None):
        waits.append(countdown)
        return Retried()

    tasks.claim(reminder.pk)
    with (
        sending(side_effect=httpx.ConnectTimeout("down")),
        mock.patch.object(tasks.deliver_reminder, "retry", capture),
        pytest.raises(Retried),
    ):
        tasks.deliver_reminder(str(reminder.pk))

    assert waits == [expected]


@pytest.mark.django_db
def test_after_the_last_attempt_the_alert_is_failed_and_flagged_missed(reminder, alex, device):
    Reminder.objects.filter(pk=reminder.pk).update(attempts=tasks.MAX_PUSH_RETRIES)

    tasks.claim(reminder.pk)
    with sending(side_effect=httpx.ConnectTimeout("down")):
        tasks.deliver_reminder(str(reminder.pk))

    reminder.refresh_from_db()
    assert reminder.state == State.FAILED
    inbox = Notification.objects.get(reminder=reminder)
    # US-13: the app shows this as a banner on next open.
    assert (inbox.push_status, inbox.missed) == (PushStatus.FAILED, True)


@pytest.mark.django_db
def test_every_token_rejected_counts_as_a_failure(reminder, alex, device):
    Reminder.objects.filter(pk=reminder.pk).update(attempts=tasks.MAX_PUSH_RETRIES)

    tasks.claim(reminder.pk)
    with sending(return_value=[rejected(device.token)]):
        tasks.deliver_reminder(str(reminder.pk))

    reminder.refresh_from_db()
    assert reminder.state == State.FAILED


# Dead tokens and receipts -------------------------------------------------------------------


@pytest.mark.django_db
def test_a_token_expo_calls_unregistered_is_deactivated_at_once(reminder, alex, device):
    Reminder.objects.filter(pk=reminder.pk).update(attempts=tasks.MAX_PUSH_RETRIES)

    tasks.claim(reminder.pk)
    with sending(return_value=[rejected(device.token)]):
        tasks.deliver_reminder(str(reminder.pk))

    device.refresh_from_db()
    assert device.active is False


@pytest.mark.django_db
def test_an_accepted_push_parks_its_receipt_id_for_later(reminder, alex, device):
    tasks.claim(reminder.pk)
    with sending(return_value=[accepted(device.token, "receipt-7")]):
        tasks.deliver_reminder(str(reminder.pk))

    parked = PushReceipt.objects.get(receipt_id="receipt-7")
    assert parked.device_token_id == device.pk


@pytest.mark.django_db
def test_the_receipt_check_deactivates_a_token_expo_reports_as_gone(alex, device):
    PushReceipt.objects.create(
        receipt_id="receipt-7",
        device_token=device,
        expires_at=timezone.now() + timedelta(hours=24),
    )

    with mock.patch.object(
        push,
        "receipts",
        return_value={"receipt-7": push.Ticket("", "error", error=push.DEVICE_NOT_REGISTERED)},
    ):
        assert tasks.check_push_receipts() == 1

    device.refresh_from_db()
    assert device.active is False
    # Answered ids are done with.
    assert PushReceipt.objects.count() == 0


@pytest.mark.django_db
def test_a_delivered_receipt_leaves_the_token_alone(alex, device):
    PushReceipt.objects.create(
        receipt_id="receipt-8",
        device_token=device,
        expires_at=timezone.now() + timedelta(hours=24),
    )

    with mock.patch.object(
        push, "receipts", return_value={"receipt-8": push.Ticket("", "ok", receipt_id="receipt-8")}
    ):
        assert tasks.check_push_receipts() == 0

    device.refresh_from_db()
    assert device.active is True


@pytest.mark.django_db
def test_an_id_expo_has_no_answer_for_yet_is_asked_about_again(alex, device):
    PushReceipt.objects.create(
        receipt_id="receipt-9",
        device_token=device,
        expires_at=timezone.now() + timedelta(hours=24),
    )

    with mock.patch.object(push, "receipts", return_value={}):
        assert tasks.check_push_receipts() == 0

    assert PushReceipt.objects.filter(receipt_id="receipt-9").exists()


@pytest.mark.django_db
def test_nothing_to_check_makes_no_request(alex):
    with mock.patch.object(push, "receipts") as called:
        assert tasks.check_push_receipts() == 0

    called.assert_not_called()


# Copy -------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_a_user_with_no_time_zone_is_told_so_in_the_body(reminder):
    Reminder.objects.filter(pk=reminder.pk).update(timezone_flagged=True)
    reminder.refresh_from_db()

    _, body = tasks.copy_for(reminder)

    assert "UTC" in body


@pytest.mark.django_db
def test_the_body_names_the_subscription(reminder):
    _, body = tasks.copy_for(reminder)

    assert reminder.subscription.name in body


# Health ------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_nothing_overdue_reports_nothing(alex):
    Reminder.objects.all().update(due_at=timezone.now() + timedelta(days=1))

    assert tasks.oldest_overdue_minutes() is None


@pytest.mark.django_db
def test_the_oldest_overdue_reminder_is_reported_in_minutes(reminder):
    Reminder.objects.filter(pk=reminder.pk).update(due_at=timezone.now() - timedelta(minutes=45))

    assert tasks.oldest_overdue_minutes() == 45


@pytest.mark.django_db
def test_a_reminder_deleted_between_claim_and_delivery_is_not_an_error(reminder):
    # The subscription was deleted while the task sat in the queue.
    reminder_id = str(reminder.pk)
    Reminder.objects.filter(pk=reminder.pk).delete()

    assert tasks.deliver_reminder(reminder_id) == "gone"


@pytest.mark.django_db
def test_a_trial_reminder_names_its_end_date(alex):
    sub = Subscription.objects.filter(owner=alex, is_trial=True).first()
    reschedule_for_subscription(sub, today=SEED_TODAY)
    row = Reminder.objects.filter(subscription=sub, kind=Kind.TRIAL_ENDING).first()

    title, body = tasks.copy_for(row)

    assert title == "Trial ending soon"
    assert sub.trial_ends_on.isoformat() in body


@pytest.mark.django_db
def test_a_price_increase_alert_has_copy_of_its_own(reminder):
    Reminder.objects.filter(pk=reminder.pk).update(kind=Kind.PRICE_INCREASE)
    reminder.refresh_from_db()

    title, body = tasks.copy_for(reminder)

    assert title == "Price went up"
    assert reminder.subscription.name in body


@pytest.mark.django_db
def test_the_receipt_row_describes_itself_for_the_admin(alex, device):
    parked = PushReceipt.objects.create(
        receipt_id="receipt-x",
        device_token=device,
        expires_at=timezone.now() + timedelta(hours=24),
    )

    assert "receipt-x" in str(parked)
