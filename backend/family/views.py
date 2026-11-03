"""Family endpoints (handoff 10 §3). Everything is scoped to the caller's own
family; another family's ids answer 404."""

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.clock import today_for
from core.contract import errors
from subscriptions.views import NO_CONTENT, body

from . import invitations, service
from .serializers import (
    FamilyCreateSerializer,
    FamilyMemberDetailSerializer,
    FamilySerializer,
    FamilyUpdateSerializer,
    InvitationPreviewSerializer,
    InvitationSerializer,
    InvitationTokenSerializer,
    InviteInputSerializer,
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


# Invitations (10 §3.5) ------------------------------------------------------------


class InvitationsView(APIView):
    @extend_schema(
        operation_id="family_invitations_create",
        tags=["family"],
        request=InviteInputSerializer,
        responses={201: InvitationSerializer, **errors(400, 401, 403, 404, 409)},
    )
    def post(self, request):
        """Email an invitation that lasts 7 days. Admins only.

        409 `already_member`, `already_invited` (resend it instead) or
        `seat_limit_reached` (offer the upgrade).
        """
        data = body(InviteInputSerializer, request)
        invitation = invitations.invite(request.user, email=data["email"], role=data["role"])
        return Response(InvitationSerializer(invitation).data, status=status.HTTP_201_CREATED)


class InvitationView(APIView):
    @extend_schema(
        operation_id="family_invitations_revoke",
        tags=["family"],
        responses={204: NO_CONTENT, **errors(401, 403, 404)},
    )
    def delete(self, request, invitation_id):
        """Revoke: the link stops working and the seat is free again. Admins only."""
        invitations.revoke(request.user, invitation_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ResendView(APIView):
    @extend_schema(
        operation_id="family_invitations_resend",
        tags=["family"],
        request=None,
        responses={200: InvitationSerializer, **errors(401, 403, 404, 409)},
    )
    def post(self, request, invitation_id):
        """Send a new link with 7 more days; the old link stops working. Admins only.

        409 `invitation_accepted` / `invitation_revoked`, or `seat_limit_reached`
        for an expired one when no seat is free.
        """
        return Response(InvitationSerializer(invitations.resend(request.user, invitation_id)).data)


class PreviewView(APIView):
    @extend_schema(
        operation_id="invitations_preview",
        tags=["family"],
        request=InvitationTokenSerializer,
        responses={200: InvitationPreviewSerializer, **errors(400, 401, 404)},
    )
    def post(self, request):
        """What the accept screen shows. `problem` says why the signed-in user
        can't accept it, if they can't. 404 `invitation_not_found`."""
        token = body(InvitationTokenSerializer, request)["token"]
        return Response(InvitationPreviewSerializer(invitations.preview(request.user, token)).data)


class AcceptView(APIView):
    @extend_schema(
        operation_id="invitations_accept",
        tags=["family"],
        request=InvitationTokenSerializer,
        responses={200: FamilySerializer, **errors(400, 401, 403, 404, 409, 410)},
    )
    def post(self, request):
        """Join the family. Needs a verified email matching the invitation.

        403 `wrong_account` / `email_unverified`; 404 `invitation_not_found`;
        409 `invitation_accepted` / `already_in_family`; 410 `invitation_expired` /
        `invitation_revoked`.
        """
        token = body(InvitationTokenSerializer, request)["token"]
        family = invitations.accept(request.user, token, today=today_for(request.user))
        return Response(FamilySerializer(family).data)
