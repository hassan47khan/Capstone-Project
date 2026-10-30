"""Devices, the in-app inbox and the notification rules.

All additive to the frozen contract. Every query is scoped to the signed-in
user, and another user's row is a 404 rather than a 403, so the API never
confirms that an id exists (spec section 11).
"""

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import rules_for
from core.clock import today_for
from core.contract import errors, not_found
from subscriptions.views import body

from .models import DeviceToken, Notification
from .scheduling import reschedule_for_user
from .serializers import (
    DeviceRegisterSerializer,
    DeviceSerializer,
    NotificationListSerializer,
    NotificationRuleSerializer,
    NotificationRuleUpdateSerializer,
)
from .tasks import ensure_notification

NO_CONTENT = OpenApiResponse(description="Done; no body.")


def _device(token: DeviceToken) -> dict:
    return {
        "id": str(token.pk),
        "platform": token.platform,
        "active": token.active,
        "last_seen_at": token.last_seen_at,
    }


class DevicesView(APIView):
    @extend_schema(
        operation_id="devices_register",
        tags=["devices"],
        request=DeviceRegisterSerializer,
        responses={200: DeviceSerializer, **errors(400, 401)},
    )
    def post(self, request):
        """Register this device for push, or refresh one already registered.

        Idempotent, and it moves the token to the caller: a handset handed
        to someone else must stop delivering to the previous account.
        """
        data = body(DeviceRegisterSerializer, request)
        token, _ = DeviceToken.objects.update_or_create(
            token=data["token"],
            defaults={"user": request.user, "platform": data["platform"], "active": True},
        )
        return Response(_device(token))


class DeviceDetailView(APIView):
    @extend_schema(
        operation_id="devices_delete",
        tags=["devices"],
        responses={204: NO_CONTENT, **errors(401, 404)},
    )
    def delete(self, request, device_id):
        """Stop sending push to this device. Used on log out."""
        deleted, _ = DeviceToken.objects.filter(pk=device_id, user=request.user).delete()
        if not deleted:
            raise not_found()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _notification(row: Notification) -> dict:
    return {
        "id": str(row.pk),
        "kind": row.kind,
        "title": row.title,
        "body": row.body,
        "subscription_id": str(row.subscription_id) if row.subscription_id else None,
        "created_at": row.created_at,
        "read": row.read_at is not None,
        "missed": row.missed,
        "push_status": row.push_status,
    }


class NotificationsView(APIView):
    @extend_schema(
        operation_id="notifications_list",
        tags=["notifications"],
        responses={200: NotificationListSerializer, **errors(401)},
    )
    def get(self, request):
        """The inbox, newest first.

        Anything of the caller's that is already due but still unsent is
        materialised into an inbox row first. That is the graded fallback
        from spec section 12: with Redis or the workers down, a user who
        opens the app still sees the alert, because the reminder rows were
        written by the API and never depended on the broker.
        """
        self._materialise_due(request.user)
        rows = list(Notification.objects.filter(user=request.user).order_by("-created_at"))
        unread = [row for row in rows if row.read_at is None]
        return Response(
            {
                "unread_count": len(unread),
                "missed_count": len([row for row in unread if row.missed]),
                "results": [_notification(row) for row in rows],
            }
        )

    @staticmethod
    def _materialise_due(user):
        from django.utils import timezone

        from .models import Reminder

        due = Reminder.objects.filter(
            user=user, state=Reminder.State.PENDING, due_at__lte=timezone.now()
        )
        for reminder in due:
            # get_or_create on a unique column, so this races safely with a
            # dispatcher doing the same thing.
            ensure_notification(reminder)


class NotificationReadView(APIView):
    @extend_schema(
        operation_id="notifications_read",
        tags=["notifications"],
        request=None,
        responses={204: NO_CONTENT, **errors(401, 404)},
    )
    def post(self, request, notification_id):
        """Mark one alert read. Idempotent."""
        from django.utils import timezone

        updated = Notification.objects.filter(
            pk=notification_id, user=request.user, read_at=None
        ).update(read_at=timezone.now())
        if (
            not updated
            and not Notification.objects.filter(pk=notification_id, user=request.user).exists()
        ):
            raise not_found()
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotificationRulesView(APIView):
    """`/me/notification-rules`.

    Neither `04 §5` nor `09` names a path for these, so this is the one
    chosen here: it sits under `/me` with the rest of the caller's own
    settings. Called out in the pull request.
    """

    @extend_schema(
        operation_id="notification_rules_retrieve",
        tags=["me"],
        responses={200: NotificationRuleSerializer, **errors(401)},
    )
    def get(self, request):
        """The caller's notification settings (handoff 09 §5)."""
        return Response(NotificationRuleSerializer(rules_for(request.user)).data)

    @extend_schema(
        operation_id="notification_rules_update",
        tags=["me"],
        request=NotificationRuleUpdateSerializer,
        responses={200: NotificationRuleSerializer, **errors(400, 401)},
    )
    def patch(self, request):
        """Change one or more settings, and reschedule what they affect."""
        changes = body(NotificationRuleUpdateSerializer, request, partial=True)
        rules = rules_for(request.user)
        for field, value in changes.items():
            setattr(rules, field, value)
        rules.save()
        # Lead times and the send hour decide every pending due_at, so the
        # existing reminders have to move with them (spec section 8).
        reschedule_for_user(request.user, today=today_for(request.user))
        return Response(NotificationRuleSerializer(rules).data)
