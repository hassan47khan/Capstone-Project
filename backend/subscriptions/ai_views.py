"""AI-epic endpoints (handoff 04 §6a, 11 §2): extractions, trials, shared plans
and Gmail. The shapes were frozen first so mobile could build against mocks;
every one is now backed by real models."""

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import rules_for
from core.clock import today_for
from core.contract import errors
from extraction import reviews
from extraction import service as gmail_service
from family.permissions import require_add, require_edit

from . import sharing, trials
from .serializers import (
    GmailConnectInputSerializer,
    GmailConnectionSerializer,
    MarkPaidInputSerializer,
    PendingExtractionListSerializer,
    ReminderSerializer,
    ScanSerializer,
    SharedPlanInputSerializer,
    SharedPlanListSerializer,
    SharedPlanSerializer,
    SubscriptionDetailSerializer,
    SubscriptionInputSerializer,
    TrialDecisionInputSerializer,
    TrialListSerializer,
    TrialSerializer,
)
from .views import body, detail


def _trials(request) -> dict:
    return trials.trials_for(
        request.user,
        today=today_for(request.user),
        alert_days=rules_for(request.user).trial_alert_days_before,
    )


NO_CONTENT = OpenApiResponse(description="Done; no body.")

# Extractions -------------------------------------------------------------------


class ScanView(APIView):
    @extend_schema(
        operation_id="extractions_scan",
        tags=["extractions"],
        request=None,
        responses={202: ScanSerializer, **errors(401, 409, 429, 503)},
    )
    def post(self, request):
        """Start scanning the connected inbox. Results arrive in GET /extractions/pending.

        409 `gmail_not_connected`. 503 `extraction_unavailable`: route to manual entry.
        """
        started = reviews.start_scan(request.user)
        return Response(ScanSerializer(started).data, status=status.HTTP_202_ACCEPTED)


class PendingExtractionsView(APIView):
    @extend_schema(
        operation_id="extractions_pending",
        tags=["extractions"],
        responses={200: PendingExtractionListSerializer, **errors(401)},
    )
    def get(self, request):
        """Extractions waiting for review. Nothing is a subscription until confirmed."""
        return Response(PendingExtractionListSerializer(reviews.pending(request.user)).data)


class ConfirmExtractionView(APIView):
    @extend_schema(
        operation_id="extractions_confirm",
        tags=["extractions"],
        request=SubscriptionInputSerializer,
        responses={201: SubscriptionDetailSerializer, **errors(400, 401, 403, 404)},
    )
    def post(self, request, extraction_id):
        """Create the subscription from the reviewed fields ("Confirm and track") and
        delete the pending record. The body is the same as POST /subscriptions.
        403 `family_cannot_add`, as for POST /subscriptions."""
        require_add(request.user)
        fields = body(SubscriptionInputSerializer, request)
        sub = reviews.confirm(request.user, extraction_id, fields)
        sub.refresh_from_db()  # as stored, like POST /subscriptions
        return Response(detail(sub, request), status=status.HTTP_201_CREATED)


class ExtractionView(APIView):
    @extend_schema(
        operation_id="extractions_discard",
        tags=["extractions"],
        responses={204: NO_CONTENT, **errors(401, 404)},
    )
    def delete(self, request, extraction_id):
        """Discard a pending extraction and its snippet."""
        reviews.discard(request.user, extraction_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


# Trials ---------------------------------------------------------------------------


class TrialsView(APIView):
    @extend_schema(
        operation_id="trials_list",
        tags=["trials"],
        responses={200: TrialListSerializer, **errors(401)},
    )
    def get(self, request):
        """Trials that have not converted, fewest days left first, with progress
        computed server-side (TrialShield, 11 §2.5)."""
        return Response(TrialListSerializer(_trials(request)).data)


class TrialDecisionView(APIView):
    @extend_schema(
        operation_id="trials_decision",
        tags=["trials"],
        request=TrialDecisionInputSerializer,
        responses={200: TrialSerializer, **errors(400, 401, 403, 404)},
    )
    def post(self, request, subscription_id):
        """Keep it (stop nagging; it converts on its end date) or Remind me.
        403 `family_cannot_edit`."""
        require_edit(request.user)
        data = body(TrialDecisionInputSerializer, request)
        decided = trials.decide(
            request.user,
            subscription_id,
            data["decision"],
            today=today_for(request.user),
            alert_days=rules_for(request.user).trial_alert_days_before,
        )
        return Response(TrialSerializer(decided).data)


# Shared plans -------------------------------------------------------------------


class SharedPlansView(APIView):
    @extend_schema(
        operation_id="shared_plans_list",
        tags=["shared-plans"],
        responses={200: SharedPlanListSerializer, **errors(401)},
    )
    def get(self, request):
        """The caller's shared plans and what others still owe them. Never changes totals."""
        return Response(
            SharedPlanListSerializer(
                sharing.shared_plans(request.user, today=today_for(request.user))
            ).data
        )

    @extend_schema(
        operation_id="shared_plans_create",
        tags=["shared-plans"],
        request=SharedPlanInputSerializer,
        responses={201: SharedPlanSerializer, **errors(400, 401, 403, 404, 409)},
    )
    def post(self, request):
        """Split one of the caller's subscriptions equally. The caller is added first
        and absorbs any extra cent. 409 `already_shared`. 403 `family_cannot_edit`,
        as for every other change to a subscription."""
        require_edit(request.user)
        data = body(SharedPlanInputSerializer, request)
        plan = sharing.create_shared_plan(
            request.user,
            data["subscription_id"],
            data["participants"],
            today=today_for(request.user),
        )
        return Response(SharedPlanSerializer(plan).data, status=status.HTTP_201_CREATED)


class RemindView(APIView):
    @extend_schema(
        operation_id="shared_plans_remind",
        tags=["shared-plans"],
        request=None,
        responses={200: ReminderSerializer, **errors(401, 404, 409, 429)},
    )
    def post(self, request, plan_id, payment_id):
        """Remind a participant about a pending share: by email when there is an
        address, otherwise the client opens the share sheet with `message`.

        409 `already_paid`. 429 `throttled`: one reminder per 24 hours.
        """
        reminder = sharing.remind(request.user, plan_id, payment_id, today=today_for(request.user))
        return Response(ReminderSerializer(reminder).data)


class MarkPaidView(APIView):
    @extend_schema(
        operation_id="shared_plans_mark_paid",
        tags=["shared-plans"],
        request=MarkPaidInputSerializer,
        responses={200: SharedPlanSerializer, **errors(400, 401, 404, 409)},
    )
    def post(self, request, plan_id, payment_id):
        """Record that a participant paid their share this period, or undo it with
        `paid: false`. Returns the updated plan.

        409 `owner_share`: the owner's own share is always paid.
        """
        data = body(MarkPaidInputSerializer, request)
        plan = sharing.mark_paid(
            request.user, plan_id, payment_id, today=today_for(request.user), paid=data["paid"]
        )
        return Response(SharedPlanSerializer(plan).data)


# Gmail ------------------------------------------------------------------------------


class GmailConnectView(APIView):
    @extend_schema(
        operation_id="gmail_connect",
        tags=["integrations"],
        request=GmailConnectInputSerializer,
        responses={200: GmailConnectionSerializer, **errors(400, 401)},
    )
    def post(self, request):
        """Exchange the OAuth code for read-only Gmail access.

        400 `gmail_denied`: "Access was denied or timed out."
        """
        data = body(GmailConnectInputSerializer, request)
        connection = gmail_service.connect(
            request.user, data["code"], data["redirect_uri"], data.get("code_verifier")
        )
        return Response(GmailConnectionSerializer(connection).data)


class GmailView(APIView):
    @extend_schema(
        operation_id="gmail_disconnect",
        tags=["integrations"],
        responses={204: NO_CONTENT, **errors(401)},
    )
    def delete(self, request):
        """Revoke Gmail access and delete every pending extraction."""
        gmail_service.disconnect(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)
