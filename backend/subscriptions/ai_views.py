"""AI-epic endpoints (handoff 04 §6a, 11 §2): extractions, trials, shared plans
and Gmail. The 04 owner freezes their shapes here so mobile can build against
mocks; the real logic and models are the 11 owner's."""

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

import mocks
from core.contract import errors

from .serializers import (
    GmailConnectInputSerializer,
    GmailConnectionSerializer,
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
from .views import body

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
        return Response(ScanSerializer(mocks.scan()).data, status=status.HTTP_202_ACCEPTED)


class PendingExtractionsView(APIView):
    @extend_schema(
        operation_id="extractions_pending",
        tags=["extractions"],
        responses={200: PendingExtractionListSerializer, **errors(401)},
    )
    def get(self, request):
        """Extractions waiting for review. Nothing is a subscription until confirmed."""
        return Response(PendingExtractionListSerializer(mocks.pending_extractions()).data)


class ConfirmExtractionView(APIView):
    @extend_schema(
        operation_id="extractions_confirm",
        tags=["extractions"],
        request=SubscriptionInputSerializer,
        responses={201: SubscriptionDetailSerializer, **errors(400, 401, 404)},
    )
    def post(self, request, extraction_id):
        """Create the subscription from the reviewed fields ("Confirm and track") and
        delete the pending record. The body is the same as POST /subscriptions."""
        fields = body(SubscriptionInputSerializer, request)
        detail = mocks.confirm_extraction(extraction_id, fields)
        return Response(SubscriptionDetailSerializer(detail).data, status=status.HTTP_201_CREATED)


class ExtractionView(APIView):
    @extend_schema(
        operation_id="extractions_discard",
        tags=["extractions"],
        responses={204: NO_CONTENT, **errors(401, 404)},
    )
    def delete(self, request, extraction_id):
        """Discard a pending extraction and its snippet."""
        mocks.discard_extraction(extraction_id)
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
        return Response(TrialListSerializer(mocks.trials()).data)


class TrialDecisionView(APIView):
    @extend_schema(
        operation_id="trials_decision",
        tags=["trials"],
        request=TrialDecisionInputSerializer,
        responses={200: TrialSerializer, **errors(400, 401, 404)},
    )
    def post(self, request, subscription_id):
        """Keep it (stop nagging; it converts on its end date) or Remind me."""
        data = body(TrialDecisionInputSerializer, request)
        return Response(
            TrialSerializer(mocks.trial_decision(subscription_id, data["decision"])).data
        )


# Shared plans -------------------------------------------------------------------


class SharedPlansView(APIView):
    @extend_schema(
        operation_id="shared_plans_list",
        tags=["shared-plans"],
        responses={200: SharedPlanListSerializer, **errors(401)},
    )
    def get(self, request):
        """The caller's shared plans and what others still owe them. Never changes totals."""
        return Response(SharedPlanListSerializer(mocks.shared_plans()).data)

    @extend_schema(
        operation_id="shared_plans_create",
        tags=["shared-plans"],
        request=SharedPlanInputSerializer,
        responses={201: SharedPlanSerializer, **errors(400, 401, 404, 409)},
    )
    def post(self, request):
        """Split one of the caller's subscriptions equally. The caller is added first
        and absorbs any extra cent. 409 `already_shared`."""
        data = body(SharedPlanInputSerializer, request)
        plan = mocks.create_shared_plan(data["subscription_id"], data["participants"])
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
        return Response(ReminderSerializer(mocks.remind(plan_id, payment_id)).data)


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
        connection = mocks.connect_gmail(
            data["code"], data["redirect_uri"], data.get("code_verifier")
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
        mocks.disconnect_gmail()
        return Response(status=status.HTTP_204_NO_CONTENT)
