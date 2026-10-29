from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    """Reminders, the in-app inbox and Expo push (spec section 8).

    Empty until phase 4 adds Reminder, Notification and DeviceToken; it exists
    now so the scheduling work lands in the app the spec names rather than
    inside subscriptions/.
    """

    name = "notifications"
