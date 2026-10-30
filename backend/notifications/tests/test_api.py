"""The notification endpoints (additive to the 04 slice 2 contract).

Every one is scoped to the signed-in user, and another user's row is a 404
rather than a 403, so an id cannot be probed (spec section 11).
"""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import rules_for
from notifications.models import DeviceToken, Notification, Reminder
from notifications.scheduling import reschedule_for_subscription
from subscriptions.models import Subscription
from subscriptions.seed import SEED_TODAY

State = Reminder.State
TOKEN = "ExponentPushToken[alex-1]"


@pytest.fixture
def other(db, django_user_model):
    user = django_user_model.objects.create_user(email="jordan@example.com", password="longenough")
    client = APIClient()
    client.force_authenticate(user)
    return user, client


@pytest.fixture
def due_reminder(alex):
    sub = Subscription.objects.filter(owner=alex, is_trial=False).first()
    reschedule_for_subscription(sub, today=SEED_TODAY)
    row = Reminder.objects.filter(subscription=sub, state=State.PENDING).first()
    Reminder.objects.exclude(pk=row.pk).delete()
    row.due_at = timezone.now() - timedelta(minutes=1)
    row.save(update_fields=["due_at"])
    return row


# Devices ------------------------------------------------------------------------


@pytest.mark.django_db
def test_registering_a_device_returns_it_without_echoing_the_token(api, contract):
    response = api.post("/api/v1/devices", {"token": TOKEN, "platform": "android"}, format="json")
    device = contract(response, "/devices")

    assert device["platform"] == "android"
    assert device["active"] is True
    # The token is a send credential for that handset; the client has it.
    assert TOKEN not in response.content.decode()


@pytest.mark.django_db
def test_registering_the_same_device_twice_keeps_one_row(api, alex):
    api.post("/api/v1/devices", {"token": TOKEN, "platform": "android"}, format="json")
    api.post("/api/v1/devices", {"token": TOKEN, "platform": "android"}, format="json")

    assert DeviceToken.objects.filter(token=TOKEN).count() == 1


@pytest.mark.django_db
def test_a_handset_given_away_follows_whoever_registered_it_last(api, alex, other):
    other_user, other_client = other
    api.post("/api/v1/devices", {"token": TOKEN, "platform": "android"}, format="json")

    other_client.post("/api/v1/devices", {"token": TOKEN, "platform": "android"}, format="json")

    # Otherwise the previous owner keeps getting this person's alerts.
    assert DeviceToken.objects.get(token=TOKEN).user_id == other_user.pk


@pytest.mark.django_db
def test_a_device_can_be_deregistered_on_log_out(api, alex):
    created = api.post(
        "/api/v1/devices", {"token": TOKEN, "platform": "android"}, format="json"
    ).json()

    assert api.delete(f"/api/v1/devices/{created['id']}").status_code == 204
    assert DeviceToken.objects.count() == 0


@pytest.mark.django_db
def test_another_users_device_is_not_found_rather_than_forbidden(api, alex, other):
    _, other_client = other
    created = api.post(
        "/api/v1/devices", {"token": TOKEN, "platform": "android"}, format="json"
    ).json()

    assert other_client.delete(f"/api/v1/devices/{created['id']}").status_code == 404
    assert DeviceToken.objects.count() == 1


@pytest.mark.django_db
def test_registering_a_device_needs_a_known_platform(api, alex):
    response = api.post("/api/v1/devices", {"token": TOKEN, "platform": "symbian"}, format="json")

    assert response.status_code == 400


# The inbox -------------------------------------------------------------------------


@pytest.mark.django_db
def test_the_inbox_lists_the_callers_alerts_newest_first(api, alex, due_reminder, contract):
    body = contract(api.get("/api/v1/notifications"), "/notifications")

    assert body["unread_count"] == 1
    assert body["results"][0]["kind"] == due_reminder.kind


@pytest.mark.django_db
def test_opening_the_inbox_materialises_alerts_the_workers_never_sent(api, alex, due_reminder):
    # The graded fallback (spec section 12): with Redis or the workers down
    # the reminder row still exists, because the API wrote it, so a user
    # who opens the app still sees the alert.
    assert Notification.objects.count() == 0

    body = api.get("/api/v1/notifications").json()

    assert body["unread_count"] == 1
    assert Notification.objects.filter(reminder=due_reminder).count() == 1


@pytest.mark.django_db
def test_opening_the_inbox_twice_does_not_duplicate_an_alert(api, alex, due_reminder):
    api.get("/api/v1/notifications")
    api.get("/api/v1/notifications")

    assert Notification.objects.filter(reminder=due_reminder).count() == 1


@pytest.mark.django_db
def test_a_reminder_not_yet_due_stays_out_of_the_inbox(api, alex, due_reminder):
    Reminder.objects.filter(pk=due_reminder.pk).update(due_at=timezone.now() + timedelta(days=1))

    assert api.get("/api/v1/notifications").json()["unread_count"] == 0


@pytest.mark.django_db
def test_missed_alerts_are_counted_so_the_app_can_say_so_once(api, alex, due_reminder):
    api.get("/api/v1/notifications")
    Notification.objects.update(missed=True)

    assert api.get("/api/v1/notifications").json()["missed_count"] == 1


@pytest.mark.django_db
def test_marking_an_alert_read_takes_it_out_of_the_unread_count(api, alex, due_reminder):
    row_id = api.get("/api/v1/notifications").json()["results"][0]["id"]

    assert api.post(f"/api/v1/notifications/{row_id}/read").status_code == 204
    assert api.get("/api/v1/notifications").json()["unread_count"] == 0


@pytest.mark.django_db
def test_marking_an_alert_read_twice_is_fine(api, alex, due_reminder):
    row_id = api.get("/api/v1/notifications").json()["results"][0]["id"]
    api.post(f"/api/v1/notifications/{row_id}/read")

    assert api.post(f"/api/v1/notifications/{row_id}/read").status_code == 204


@pytest.mark.django_db
def test_another_users_alert_is_not_found(api, alex, due_reminder, other):
    _, other_client = other
    row_id = api.get("/api/v1/notifications").json()["results"][0]["id"]

    assert other_client.post(f"/api/v1/notifications/{row_id}/read").status_code == 404


@pytest.mark.django_db
def test_the_inbox_shows_nobody_elses_alerts(api, alex, due_reminder, other):
    _, other_client = other
    # Alex opens theirs first, so there is actually a row to leak. Without
    # this the assertion passes whatever the queryset is scoped to.
    assert api.get("/api/v1/notifications").json()["unread_count"] == 1

    assert other_client.get("/api/v1/notifications").json()["results"] == []


# Notification rules ----------------------------------------------------------------------


@pytest.mark.django_db
def test_the_rules_come_back_with_every_field_the_screen_shows(api, alex, contract):
    body = contract(api.get("/api/v1/me/notification-rules"), "/me/notification-rules")

    # Handoff 09 §5's four sections.
    assert body["days_before_reminder"] == 3
    assert body["trial_alert_days_before"] == 2
    assert body["send_push"] is True
    assert body["monthly_report_enabled"] is False


@pytest.mark.django_db
def test_one_row_can_be_saved_at_a_time(api, alex):
    body = api.patch(
        "/api/v1/me/notification-rules", {"days_before_reminder": 7}, format="json"
    ).json()

    assert body["days_before_reminder"] == 7
    assert rules_for(alex).days_before_reminder == 7


@pytest.mark.django_db
def test_changing_the_lead_time_moves_the_pending_reminders(api, alex, due_reminder):
    before = due_reminder.due_at

    api.patch("/api/v1/me/notification-rules", {"days_before_reminder": 10}, format="json")

    # Otherwise the setting would only apply to subscriptions edited later.
    assert not Reminder.objects.filter(pk=due_reminder.pk, state=State.PENDING).exists()
    moved = Reminder.objects.filter(
        subscription=due_reminder.subscription, state=State.PENDING
    ).first()
    assert moved is not None and moved.due_at != before


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("days_before_reminder", 0),
        ("days_before_reminder", 31),
        ("trial_alert_days_before", 15),
        ("report_delivery_day", 29),
    ],
)
def test_the_steppers_keep_to_their_ranges(api, alex, field, value):
    response = api.patch("/api/v1/me/notification-rules", {field: value}, format="json")

    assert response.status_code == 400


@pytest.mark.django_db
def test_the_rules_are_the_callers_own(api, alex, other):
    _, other_client = other
    api.patch("/api/v1/me/notification-rules", {"days_before_reminder": 9}, format="json")

    assert other_client.get("/api/v1/me/notification-rules").json()["days_before_reminder"] == 3


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/v1/notifications"),
        ("get", "/api/v1/me/notification-rules"),
        ("post", "/api/v1/devices"),
    ],
)
def test_every_new_endpoint_needs_a_token(db, method, path):
    assert getattr(APIClient(), method)(path).status_code == 401
