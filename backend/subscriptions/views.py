"""Subscription and analytics endpoints (handoff 04 §5). Requests are validated
for real; the answers come from `mocks` until slice 3 swaps in the real logic."""

import re
from datetime import timedelta

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

import mocks
from core.contract import errors

from .serializers import (
    STATUSES,
    HistoryEventSerializer,
    PriceChangesSerializer,
    SpendOverTimeSerializer,
    SubscriptionDetailSerializer,
    SubscriptionInputSerializer,
    SubscriptionListSerializer,
    SummarySerializer,
    UpcomingSerializer,
)
from .services.cycles import add_months

NO_CONTENT = OpenApiResponse(description="Done; no body.")
MAX_RANGE_DAYS = 366


def query(serializer_class, request) -> dict:
    serializer = serializer_class(data=request.query_params)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def body(serializer_class, request, *, partial=False) -> dict:
    serializer = serializer_class(data=request.data, partial=partial)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


# Subscriptions ----------------------------------------------------------------


class SubscriptionListQuery(serializers.Serializer):
    category = serializers.CharField(required=False, help_text="Category slug.")
    status = serializers.ChoiceField(
        choices=STATUSES, required=False, help_text="Default: both active and cancelled."
    )


class SubscriptionsView(APIView):
    @extend_schema(
        operation_id="subscriptions_list",
        tags=["subscriptions"],
        parameters=[SubscriptionListQuery],
        responses={200: SubscriptionListSerializer, **errors(400, 401)},
    )
    def get(self, request):
        """The caller's subscriptions, soonest bill first; cancelled ones last.
        Deleted subscriptions never appear."""
        params = query(SubscriptionListQuery, request)
        return Response(SubscriptionListSerializer(mocks.list_subscriptions(**params)).data)

    @extend_schema(
        operation_id="subscriptions_create",
        tags=["subscriptions"],
        request=SubscriptionInputSerializer,
        responses={201: SubscriptionDetailSerializer, **errors(400, 401)},
    )
    def post(self, request):
        """Add a subscription. next_bill_date is computed from start_date and the cycle.

        400 `price_invalid`: "Enter a valid price greater than $0."
        """
        fields = body(SubscriptionInputSerializer, request)
        detail = mocks.create_subscription(fields)
        return Response(SubscriptionDetailSerializer(detail).data, status=status.HTTP_201_CREATED)


class SubscriptionDetailView(APIView):
    @extend_schema(
        operation_id="subscriptions_retrieve",
        tags=["subscriptions"],
        responses={200: SubscriptionDetailSerializer, **errors(401, 404)},
    )
    def get(self, request, subscription_id):
        """One subscription with its monthly equivalent, total spent and history."""
        return Response(SubscriptionDetailSerializer(mocks.get_subscription(subscription_id)).data)

    @extend_schema(
        operation_id="subscriptions_update",
        tags=["subscriptions"],
        request=SubscriptionInputSerializer,
        responses={200: SubscriptionDetailSerializer, **errors(400, 401, 404)},
    )
    def patch(self, request, subscription_id):
        """Change any fields. A price, category or cycle change writes one history event each."""
        changes = body(SubscriptionInputSerializer, request, partial=True)
        detail = mocks.update_subscription(subscription_id, changes)
        return Response(SubscriptionDetailSerializer(detail).data)

    @extend_schema(
        operation_id="subscriptions_delete",
        tags=["subscriptions"],
        responses={204: NO_CONTENT, **errors(401, 404)},
    )
    def delete(self, request, subscription_id):
        """Soft delete: it leaves every list and total, its history is kept, and
        POST .../restore undoes it."""
        mocks.delete_subscription(subscription_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CancelView(APIView):
    @extend_schema(
        operation_id="subscriptions_cancel",
        tags=["subscriptions"],
        request=None,
        responses={200: SubscriptionDetailSerializer, **errors(401, 404, 409)},
    )
    def post(self, request, subscription_id):
        """Mark as cancelled: out of totals, history kept, saved_per_year set.

        409 `already_cancelled`.
        """
        return Response(
            SubscriptionDetailSerializer(mocks.cancel_subscription(subscription_id)).data
        )


class RestoreView(APIView):
    @extend_schema(
        operation_id="subscriptions_restore",
        tags=["subscriptions"],
        request=None,
        responses={200: SubscriptionDetailSerializer, **errors(401, 404)},
    )
    def post(self, request, subscription_id):
        """Undo a delete: puts back the status it had before. Powers the Undo toast."""
        return Response(
            SubscriptionDetailSerializer(mocks.restore_subscription(subscription_id)).data
        )


class HistoryView(APIView):
    @extend_schema(
        operation_id="subscriptions_history",
        tags=["subscriptions"],
        responses={200: HistoryEventSerializer(many=True), **errors(401, 404)},
    )
    def get(self, request, subscription_id):
        """Every recorded change, newest first."""
        events = mocks.subscription_history(subscription_id)
        return Response(HistoryEventSerializer(events, many=True).data)


# Analytics ---------------------------------------------------------------------


class SummaryQuery(serializers.Serializer):
    period = serializers.ChoiceField(choices=["current_month"], default="current_month")


class SummaryView(APIView):
    @extend_schema(
        operation_id="analytics_summary",
        tags=["analytics"],
        parameters=[SummaryQuery],
        responses={200: SummarySerializer, **errors(400, 401)},
    )
    def get(self, request):
        """Monthly and annual totals and the category breakdown. The one source for
        Home's donut and Analytics' bars (08 §3)."""
        params = query(SummaryQuery, request)
        return Response(SummarySerializer(mocks.summary(params["period"])).data)


class SpendOverTimeQuery(serializers.Serializer):
    months = serializers.IntegerField(min_value=1, max_value=24, default=12)


class SpendOverTimeView(APIView):
    @extend_schema(
        operation_id="analytics_spend_over_time",
        tags=["analytics"],
        parameters=[SpendOverTimeQuery],
        responses={200: SpendOverTimeSerializer, **errors(400, 401)},
    )
    def get(self, request):
        """Monthly recurring spend per month, ending with this month, and the change
        from last month. Home calls it with months=2."""
        params = query(SpendOverTimeQuery, request)
        return Response(SpendOverTimeSerializer(mocks.spend_over_time(params["months"])).data)


class UpcomingQuery(serializers.Serializer):
    days = serializers.IntegerField(
        min_value=0, max_value=MAX_RANGE_DAYS, default=30, help_text="From today, inclusive."
    )
    start = serializers.DateField(required=False, help_text="With `end`, a date range instead.")
    end = serializers.DateField(required=False, help_text="Inclusive.")

    def validate(self, attrs):
        start, end = attrs.get("start"), attrs.get("end")
        if (start is None) != (end is None):
            raise serializers.ValidationError("Send both start and end, or neither.")
        if start and not start <= end <= start + timedelta(days=MAX_RANGE_DAYS):
            raise serializers.ValidationError(
                f"end must be on or after start, at most {MAX_RANGE_DAYS} days later."
            )
        return attrs


class UpcomingView(APIView):
    @extend_schema(
        operation_id="analytics_upcoming",
        tags=["analytics"],
        parameters=[UpcomingQuery],
        responses={200: UpcomingSerializer, **errors(400, 401)},
    )
    def get(self, request):
        """Every bill in a window, soonest first, at the price in effect on its date.
        Past dates show what was charged; future dates what will be (Calendar, 11 §1)."""
        params = query(UpcomingQuery, request)
        start = params.get("start") or mocks.TODAY
        end = params.get("end") or mocks.TODAY + timedelta(days=params["days"])
        return Response(UpcomingSerializer(mocks.upcoming(start, end)).data)


class PriceChangesQuery(serializers.Serializer):
    months = serializers.IntegerField(
        min_value=1,
        max_value=120,
        required=False,
        help_text="Look back this many months (default 12).",
    )
    since = serializers.RegexField(
        r"^-\d{1,4}d$", required=False, help_text="Look back this many days instead, e.g. `-30d`."
    )
    include_upcoming = serializers.BooleanField(
        default=False, help_text="Also future changes, and trials about to convert."
    )
    subscription = serializers.CharField(required=False, help_text="Only this subscription.")

    def validate(self, attrs):
        if "months" in attrs and "since" in attrs:
            raise serializers.ValidationError("Send months or since, not both.")
        return attrs


class PriceChangesView(APIView):
    @extend_schema(
        operation_id="analytics_price_changes",
        tags=["analytics"],
        parameters=[PriceChangesQuery],
        responses={200: PriceChangesSerializer, **errors(400, 401, 404)},
    )
    def get(self, request):
        """Price changes, newest first. The Detail chart uses months=12&subscription={id};
        Home's Urgent attention uses since=-30d&include_upcoming=true."""
        params = query(PriceChangesQuery, request)
        if "since" in params:
            start = mocks.TODAY - timedelta(days=int(re.match(r"-(\d+)d", params["since"])[1]))
        else:
            start = add_months(mocks.TODAY, -params.get("months", 12))
        result = mocks.price_changes(
            start,
            include_upcoming=params["include_upcoming"],
            subscription_id=params.get("subscription"),
        )
        return Response(PriceChangesSerializer(result).data)
