"""Request and response shapes for the notification endpoints.

Additive to the frozen contract (04 slice 2): new paths only, the existing
envelope, `{amount, currency}` nowhere because nothing here is money.
"""

from rest_framework import serializers

from .models import DeviceToken, Notification, Reminder


class DeviceRegisterSerializer(serializers.Serializer):
    token = serializers.CharField(
        max_length=255, help_text="The Expo push token, e.g. ExponentPushToken[xxxxxxxx]."
    )
    platform = serializers.ChoiceField(choices=DeviceToken.Platform.choices)


class DeviceSerializer(serializers.Serializer):
    id = serializers.CharField()
    platform = serializers.ChoiceField(choices=DeviceToken.Platform.choices)
    active = serializers.BooleanField()
    last_seen_at = serializers.DateTimeField()
    # The token itself is never echoed: it is a send credential for that
    # handset, and the client already has it.


class NotificationSerializer(serializers.Serializer):
    id = serializers.CharField()
    kind = serializers.ChoiceField(choices=Reminder.Kind.choices)
    title = serializers.CharField()
    body = serializers.CharField()
    subscription_id = serializers.CharField(allow_null=True)
    created_at = serializers.DateTimeField()
    read = serializers.BooleanField()
    missed = serializers.BooleanField(
        help_text="Every push attempt failed, so the app shows it as a banner (US-13)."
    )
    push_status = serializers.ChoiceField(choices=Notification.PushStatus.choices)


class NotificationListSerializer(serializers.Serializer):
    unread_count = serializers.IntegerField()
    missed_count = serializers.IntegerField(
        help_text="Unread alerts whose push never arrived, so the app can say so once."
    )
    results = NotificationSerializer(many=True, help_text="Newest first.")


class NotificationRuleSerializer(serializers.Serializer):
    """Handoff 09 §5's Notifications screen, field for field."""

    days_before_reminder = serializers.IntegerField(min_value=1, max_value=30)
    reminder_time = serializers.TimeField()
    send_push = serializers.BooleanField()
    send_email = serializers.BooleanField()
    alert_on_any_price_change = serializers.BooleanField()
    price_alert_threshold = serializers.DecimalField(
        max_digits=10, decimal_places=2, allow_null=True, help_text="Null means any rise."
    )
    weekly_summary_enabled = serializers.BooleanField()
    monthly_report_enabled = serializers.BooleanField()
    report_delivery_day = serializers.IntegerField(min_value=1, max_value=28)
    trial_alert_days_before = serializers.IntegerField(min_value=1, max_value=14)


class NotificationRuleUpdateSerializer(NotificationRuleSerializer):
    """Every field optional: the screen saves one row at a time."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            field.required = False
