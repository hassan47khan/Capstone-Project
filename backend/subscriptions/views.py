"""Subscription and analytics endpoints (handoff 04 §5), always scoped to the
signed-in user. Writes go through `operations`, figures through the money
engine, and payloads through `presenters`; the analytics reads are in
`analytics`."""

import re
from datetime import timedelta

from bson import ObjectId
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.clock import today_for
from core.contract import ApiError, errors, not_found

from . import analytics, operations, presenters
from .models import Category, Subscription
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


def context(request) -> presenters.Context:
    return presenters.Context.for_user(request.user, today=today_for(request.user))


def owned(request, subscription_id: str, *, include_deleted=False) -> Subscription:
    """The caller's subscription, or 404, never 403, so ids cannot be probed."""
    if not ObjectId.is_valid(subscription_id):
        raise not_found()
    manager = Subscription.all_objects if include_deleted else Subscription.objects
    sub = manager.filter(owner=request.user, pk=ObjectId(subscription_id)).first()
    if sub is None:
        raise not_found()
    return sub


def detail(sub: Subscription, request, ctx=None) -> dict:
    return SubscriptionDetailSerializer(
        presenters.subscription_detail(sub, ctx or context(request))
    ).data


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
        subs = Subscription.objects.filter(owner=request.user).select_related("category")
        if params.get("category"):
            found = Category.objects.filter(slug=params["category"]).first()
            subs = subs.filter(category=found) if found else subs.none()
        if params.get("status"):
            subs = subs.filter(status=params["status"])
        # Soonest bill first; cancelled ones (no next bill) after, by name.
        ordered = sorted(subs, key=lambda s: (s.next_bill_date is None, s.next_bill_date, s.name))
        ctx = context(request)
        rows = [presenters.subscription(sub, ctx) for sub in ordered]
        return Response(
            SubscriptionListSerializer({"count": len(rows), "next": None, "results": rows}).data
        )

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
        sub = operations.create_subscription(
            today=today_for(request.user), owner=request.user, **fields
        )
        return Response(detail(sub, request), status=status.HTTP_201_CREATED)


class SubscriptionDetailView(APIView):
    @extend_schema(
        operation_id="subscriptions_retrieve",
        tags=["subscriptions"],
        responses={200: SubscriptionDetailSerializer, **errors(401, 404)},
    )
    def get(self, request, subscription_id):
        """One subscription with its monthly equivalent, total spent and history."""
        return Response(detail(owned(request, subscription_id), request))

    @extend_schema(
        operation_id="subscriptions_update",
        tags=["subscriptions"],
        request=SubscriptionInputSerializer,
        responses={200: SubscriptionDetailSerializer, **errors(400, 401, 404)},
    )
    def patch(self, request, subscription_id):
        """Change any fields. A price, category or cycle change writes one history event each."""
        sub = owned(request, subscription_id)
        changes = body(SubscriptionInputSerializer, request, partial=True)
        operations.update_subscription(sub, today=today_for(request.user), **changes)
        return Response(detail(sub, request))

    @extend_schema(
        operation_id="subscriptions_delete",
        tags=["subscriptions"],
        responses={204: NO_CONTENT, **errors(401, 404)},
    )
    def delete(self, request, subscription_id):
        """Soft delete: it leaves every list and total, its history is kept, and
        POST .../restore undoes it."""
        operations.soft_delete(owned(request, subscription_id))
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
        sub = owned(request, subscription_id)
        if sub.status == Subscription.Status.CANCELLED:
            raise ApiError(409, "already_cancelled", "This subscription is already cancelled.")
        operations.cancel_subscription(sub, today=today_for(request.user))
        return Response(detail(sub, request))


class RestoreView(APIView):
    @extend_schema(
        operation_id="subscriptions_restore",
        tags=["subscriptions"],
        request=None,
        responses={200: SubscriptionDetailSerializer, **errors(401, 404)},
    )
    def post(self, request, subscription_id):
        """Undo a delete: puts back the status it had before. Powers the Undo toast."""
        sub = owned(request, subscription_id, include_deleted=True)
        operations.restore(sub, today=today_for(request.user))
        return Response(detail(sub, request))


class HistoryView(APIView):
    @extend_schema(
        operation_id="subscriptions_history",
        tags=["subscriptions"],
        responses={200: HistoryEventSerializer(many=True), **errors(401, 404)},
    )
    def get(self, request, subscription_id):
        """Every recorded change, newest first."""
        events = presenters.history(owned(request, subscription_id))
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
        result = analytics.summary(request.user, context(request), params["period"])
        return Response(SummarySerializer(result).data)


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
        result = analytics.spend_over_time(request.user, context(request), params["months"])
        return Response(SpendOverTimeSerializer(result).data)


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
        ctx = context(request)
        start = params.get("start") or ctx.today
        end = params.get("end") or ctx.today + timedelta(days=params["days"])
        return Response(UpcomingSerializer(analytics.upcoming(request.user, ctx, start, end)).data)


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
        ctx = context(request)
        if "since" in params:
            start = ctx.today - timedelta(days=int(re.match(r"-(\d+)d", params["since"])[1]))
        else:
            start = add_months(ctx.today, -params.get("months", 12))
        subscription = params.get("subscription")
        result = analytics.price_changes(
            request.user,
            ctx,
            start,
            include_upcoming=params["include_upcoming"],
            subscription=owned(request, subscription) if subscription else None,
        )
        return Response(PriceChangesSerializer(result).data)
