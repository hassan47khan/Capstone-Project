"""Family endpoints (handoff 10 §3). Everything is scoped to the caller's own
family; another family's ids answer 404."""

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.clock import today_for
from core.contract import errors
from subscriptions.views import NO_CONTENT, body

from . import service
from .serializers import (
    FamilyCreateSerializer,
    FamilyMemberDetailSerializer,
    FamilySerializer,
    FamilyUpdateSerializer,
    MemberUpdateSerializer,
)


class FamilyView(APIView):
    @extend_schema(
        operation_id="family_retrieve",
        tags=["family"],
        responses={200: FamilySerializer, **errors(401, 404)},
    )
    def get(self, request):
        """The caller's family: the total, and each member's role, count and total.

        404 `no_family`: not in one yet (show "Start a family").
        """
        data = service.dashboard(request.user, today=today_for(request.user))
        return Response(FamilySerializer(data).data)

    @extend_schema(
        operation_id="family_create",
        tags=["family"],
        request=FamilyCreateSerializer,
        responses={201: FamilySerializer, **errors(400, 401, 409)},
    )
    def post(self, request):
        """Start a family. The caller is its first admin.

        409 `already_in_family`.
        """
        data = body(FamilyCreateSerializer, request)
        family = service.create_family(
            request.user,
            name=data["name"],
            display_currency=data.get("display_currency"),
            today=today_for(request.user),
        )
        return Response(FamilySerializer(family).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        operation_id="family_update",
        tags=["family"],
        request=FamilyUpdateSerializer,
        responses={200: FamilySerializer, **errors(400, 401, 403, 404)},
    )
    def patch(self, request):
        """Family settings (10 §3.2, §3.7). Admins only: 403 `family_admin_only`."""
        changes = body(FamilyUpdateSerializer, request, partial=True)
        family = service.update_family(request.user, changes, today=today_for(request.user))
        return Response(FamilySerializer(family).data)

    @extend_schema(
        operation_id="family_delete",
        tags=["family"],
        responses={204: NO_CONTENT, **errors(401, 403, 404)},
    )
    def delete(self, request):
        """End the family. Everyone keeps their subscriptions; none is deleted. Admins only."""
        service.delete_family(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MemberView(APIView):
    @extend_schema(
        operation_id="family_members_retrieve",
        tags=["family"],
        responses={200: FamilyMemberDetailSerializer, **errors(401, 404)},
    )
    def get(self, request, membership_id):
        """One member: permissions, limit, total and subscriptions. Admins see
        anyone, everyone else only themselves. Others' private subscriptions
        come back with only their amount."""
        data = service.member_detail(request.user, membership_id, today=today_for(request.user))
        return Response(FamilyMemberDetailSerializer(data).data)

    @extend_schema(
        operation_id="family_members_update",
        tags=["family"],
        request=MemberUpdateSerializer,
        responses={200: FamilyMemberDetailSerializer, **errors(400, 401, 403, 404, 409)},
    )
    def patch(self, request, membership_id):
        """Change a role, a permission or the spending limit. Admins only.

        409 `last_admin`: the family's only admin can't stop being one.
        """
        changes = body(MemberUpdateSerializer, request, partial=True)
        data = service.update_member(
            request.user, membership_id, changes, today=today_for(request.user)
        )
        return Response(FamilyMemberDetailSerializer(data).data)

    @extend_schema(
        operation_id="family_members_remove",
        tags=["family"],
        responses={204: NO_CONTENT, **errors(401, 403, 404, 409)},
    )
    def delete(self, request, membership_id):
        """Remove someone (admins), or leave (your own id). Their subscriptions stay
        theirs and leave the family total; nothing is deleted.

        409 `last_admin`: promote someone first.
        """
        service.remove_member(request.user, membership_id)
        return Response(status=status.HTTP_204_NO_CONTENT)
