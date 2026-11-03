import redis
from django.conf import settings
from django.db import DatabaseError, connection
from django.shortcuts import render
from drf_spectacular.utils import extend_schema, inline_serializer
from redis.exceptions import RedisError
from rest_framework import serializers
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from extraction import circuit
from notifications.tasks import OVERDUE_INCIDENT_MINUTES, oldest_overdue_minutes


def home(request):
    return render(request, "core/home.html")


def _redis_state() -> str:
    """Whether the broker and shared cache are reachable.

    Unconfigured counts as down, and truthfully so: with no Redis there is
    no worker, so nothing on the beat schedule is running.
    """
    if not settings.REDIS_URL:
        return "down"
    try:
        redis.Redis.from_url(settings.REDIS_URL, socket_connect_timeout=2, socket_timeout=2).ping()
    except (RedisError, OSError):
        return "down"
    return "ok"


@extend_schema(
    responses={
        (200, "application/json"): inline_serializer(
            "Health",
            {
                "status": serializers.CharField(),
                "database": serializers.CharField(),
                "redis": serializers.CharField(),
                "oldest_overdue_reminder_minutes": serializers.IntegerField(allow_null=True),
                "llm": serializers.CharField(allow_null=True),
            },
        ),
    },
)
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    """
    Public liveness check (spec sections 5 and 12).

    Only MongoDB can make this 503: it is the system of record, and nothing
    works without it. Redis being down is `degraded`, not an outage -- the
    app still reads and writes, reminders are only late, and the rows are
    safe in MongoDB either way.
    """
    try:
        connection.ensure_connection()
        connection.database.command("ping")
    except DatabaseError:
        # Spec section 12: MongoDB down means 503 so the app shows retry.
        return Response({"status": "unavailable", "database": "down"}, status=503)
    redis_state = _redis_state()
    overdue = oldest_overdue_minutes()
    # Section 12: alerts piling up unsent means the dispatcher is not
    # running, which is an incident even while everything else answers.
    reminders_stuck = overdue is not None and overdue > OVERDUE_INCIDENT_MINUTES
    healthy = redis_state == "ok" and not reminders_stuck
    return Response(
        {
            "status": "ok" if healthy else "degraded",
            "database": "ok",
            "redis": redis_state,
            "oldest_overdue_reminder_minutes": overdue,
            # ok, open (the breaker tripped), disabled (the kill switch) or
            # unconfigured. Never makes `status` degraded: extraction has a
            # manual fallback, so the model being away is not an outage.
            "llm": circuit.state(),
        }
    )
