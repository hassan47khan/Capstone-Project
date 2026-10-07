from django.db import DatabaseError, connection
from django.shortcuts import render
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


def home(request):
    return render(request, "core/home.html")


@extend_schema(
    responses={
        (200, "application/json"): inline_serializer(
            "Health",
            {"status": serializers.CharField(), "database": serializers.CharField()},
        ),
    },
)
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    """
    Public liveness check. Reports MongoDB only for now; Redis and the LLM
    circuit state join when those subsystems exist (spec section 5).
    """
    try:
        connection.ensure_connection()
        connection.database.command("ping")
    except DatabaseError:
        # Spec section 12: MongoDB down means 503 so the app shows retry.
        return Response({"status": "unavailable", "database": "down"}, status=503)
    return Response({"status": "ok", "database": "ok"})
