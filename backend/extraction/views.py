from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from core.contract import errors
from subscriptions.views import context

from . import insight
from .serializers import InsightResponseSerializer


class InsightView(APIView):
    @extend_schema(
        operation_id="analytics_insight",
        tags=["analytics"],
        responses={200: InsightResponseSerializer, **errors(401)},
    )
    def get(self, request):
        """The Analytics AI insight card (08 §2.0): one sentence, or null to hide the card.

        Worded by the model from computed facts, and every number in it is
        checked against those facts; otherwise the template sentence is used.
        """
        return Response(
            InsightResponseSerializer(insight.insight_for(request.user, context(request))).data
        )
