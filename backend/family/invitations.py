"""Family invitations (handoff 10 §3.5, §5).

An admin invites an email address with a role. The invitee gets a link
(`core.links`, kind `family-invite`), and the app previews it and accepts it,
after registering first if they have no account. Invitations last 7 days;
resending issues a new link and restarts the clock, revoking ends it.

The token travels in request bodies, never in a path, so it doesn't end up in
the request log. Accepting needs a verified email that matches the invite:
that's what proves the link reached the person it was meant for.

Seats: members plus invitations still pending count against `seat_limit`.
That check is read-then-write with nothing in the database behind it, so two
invitations to different addresses sent at the same moment can both pass and
leave the family one over; accept still refuses nobody for it. A second invite
to the same address can't race through: `pending_invitation_per_email` backs
`already_invited`.
"""

import hashlib
import secrets
from datetime import timedelta

from bson import ObjectId
from django.db import IntegrityError
from django.utils import timezone
from django_mongodb_backend import transaction
from rest_framework import status

from accounts.auth import normalize
from core.contract import ApiError, not_found
from core.links import app_link
from core.tasks import queue_email

from .models import Invitation, Membership
from .permissions import membership_of
from .service import _admin, already_in_family, dashboard

LIFETIME = timedelta(days=7)
Status = Invitation.Status


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _issue(invitation: Invitation) -> str:
    """A fresh token for `invitation`; only its digest is kept."""
    token = secrets.token_urlsafe(32)
    now = timezone.now()
    invitation.digest = _digest(token)
    invitation.expires_at = now + LIFETIME
    invitation.sent_at = now
    invitation.status = Status.PENDING
    return token


ROLE_PHRASES = {
    Membership.Role.ADMIN: "an admin",
    Membership.Role.MEMBER: "a member",
    Membership.Role.VIEWER: "a viewer",
}


def display_name(user) -> str:
    """Who someone is to other people. Registering never asks for a name, so
    most real accounts have none: fall back to the email, never "None"."""
    return user.name or user.email


def _send(invitation: Invitation, token: str, inviter) -> None:
    link = app_link("family-invite", token=token)
    who = display_name(inviter)
    subject = f"{who} invited you to {invitation.family.name} on SubTrak"
    body = (
        f"{who} invited you to join {invitation.family.name} on SubTrak as "
        f"{ROLE_PHRASES[invitation.role]}.\n\n"
        "Family admins can see your subscriptions and what they cost. You can mark any "
        "subscription private: it still counts in the family total, but its name is hidden.\n\n"
        f"The invitation works for 7 days.\n\n{link}\n"
    )
    queue_email(subject, body, [invitation.email])


# Errors -----------------------------------------------------------------------------


def _conflict(code: str, message: str, field: str | None = None) -> ApiError:
    fields = {field: [message]} if field else None
    return ApiError(status.HTTP_409_CONFLICT, code, message, fields=fields)


def _already_invited() -> ApiError:
    return _conflict(
        "already_invited", "They already have an invitation. Resend it instead.", "email"
    )


def seat_limit_reached(family) -> ApiError:
    return _conflict(
        "seat_limit_reached",
        f"{family.name} has all {family.seat_limit} seats taken. Upgrade the plan to add more.",
    )


def _invalid() -> ApiError:
    return ApiError(
        status.HTTP_404_NOT_FOUND, "invitation_not_found", "This invitation link isn't valid."
    )


# Seats ------------------------------------------------------------------------------


def _pending(family, now) -> list[Invitation]:
    rows = Invitation.objects.filter(family=family, status=Status.PENDING)
    return [i for i in rows if i.expires_at > now]


def seats_taken(family, now) -> int:
    # Not .count(): that's a $unionWith, which MongoDB refuses inside a transaction.
    members = len(Membership.objects.filter(family=family).values_list("pk"))
    return members + len(_pending(family, now))


# Admin side -------------------------------------------------------------------------


def present(invitation: Invitation, now) -> dict:
    return {
        "id": str(invitation.pk),
        "email": invitation.email,
        "role": invitation.role,
        "status": invitation.status_at(now),
        "expires_at": invitation.expires_at,
        "sent_at": invitation.sent_at,
    }


def for_admin(family) -> list[dict]:
    """Pending and expired invitations, newest first: the members list shows
    them as "Invited" rows with Resend and Revoke (10 §6). Expired rows keep
    `pending` in storage (see `Invitation.status_at`), so one filter gets both."""
    now = timezone.now()
    rows = Invitation.objects.filter(family=family, status=Status.PENDING).order_by("-sent_at")
    return [present(i, now) for i in rows]


def invite(user, *, email: str, role: str) -> dict:
    admin = _admin(user)
    family = admin.family
    email = normalize(email)
    now = timezone.now()
    with transaction.atomic():
        members = Membership.objects.filter(family=family).select_related("user")
        if any(m.user.email == email for m in members):
            raise _conflict("already_member", "They're already in this family.", "email")
        if any(i.email == email for i in _pending(family, now)):
            raise _already_invited()
        if seats_taken(family, now) >= family.seat_limit:
            raise seat_limit_reached(family)
        # An old invite to this address that expired is still `pending` in
        # storage; record it as expired so the new one can take its place.
        Invitation.objects.filter(
            family=family, email=email, status=Status.PENDING, expires_at__lte=now
        ).update(status=Status.EXPIRED)
        invitation = Invitation(family=family, email=email, role=role, invited_by=user)
        token = _issue(invitation)
        try:
            invitation.save()
        except IntegrityError:
            # Lost a race with a simultaneous invite to the same address.
            raise _already_invited() from None
    _send(invitation, token, user)
    return present(invitation, now)


def _admins_invitation(user, invitation_id: str) -> Invitation:
    family = _admin(user).family
    if not ObjectId.is_valid(invitation_id):
        raise not_found()
    found = (
        Invitation.objects.filter(family=family, pk=ObjectId(invitation_id))
        .select_related("family")
        .first()
    )
    if found is None:
        raise not_found()
    return found


def resend(user, invitation_id: str) -> dict:
    """A new link and seven more days. The old link stops working."""
    invitation = _admins_invitation(user, invitation_id)
    if invitation.status == Status.ACCEPTED:
        raise _conflict("invitation_accepted", "This invitation was accepted.")
    if invitation.status == Status.REVOKED:
        raise _conflict("invitation_revoked", "This invitation was revoked.")
    if invitation.status == Status.EXPIRED:
        # Stored as expired when a newer invite replaced it: resend that one.
        raise _conflict("invitation_expired", "This invitation was replaced by a newer one.")
    now = timezone.now()
    if invitation.status_at(now) == Status.EXPIRED and (
        seats_taken(invitation.family, now) >= invitation.family.seat_limit
    ):
        # An expired invite gave its seat back; it can only have it again if one is free.
        raise seat_limit_reached(invitation.family)
    token = _issue(invitation)
    invitation.save(update_fields=["digest", "expires_at", "sent_at", "status"])
    _send(invitation, token, user)
    return present(invitation, timezone.now())


def revoke(user, invitation_id: str) -> None:
    invitation = _admins_invitation(user, invitation_id)
    if invitation.status == Status.PENDING:
        invitation.status = Status.REVOKED
        invitation.save(update_fields=["status"])


# Invitee side -----------------------------------------------------------------------


def _by_token(token: str) -> Invitation:
    digest = _digest(token)
    # Looked up by digest, so the comparison happens in the query. A 256-bit
    # random token leaves nothing to guess or time.
    found = Invitation.objects.filter(digest=digest).select_related("family", "invited_by").first()
    if found is None:
        raise _invalid()
    return found


def preview(user, token: str) -> dict:
    """What the accept screen shows, including why it can't be accepted
    (10 §3.5 step 4: expired, already accepted, wrong account)."""
    invitation = _by_token(token)
    now = timezone.now()
    state = invitation.status_at(now)
    mine = membership_of(user)
    if state != Status.PENDING:
        problem = state
    elif invitation.email != normalize(user.email):
        problem = "wrong_account"
    elif mine is not None:
        problem = (
            "already_member" if mine.family_id == invitation.family_id else "in_another_family"
        )
    else:
        problem = None
    return {
        "family_name": invitation.family.name,
        "invited_by": display_name(invitation.invited_by),
        "email": invitation.email,
        "role": invitation.role,
        "status": state,
        "expires_at": invitation.expires_at,
        "problem": problem,
    }


def accept(user, token: str, *, today) -> dict:
    invitation = _by_token(token)
    now = timezone.now()
    state = invitation.status_at(now)
    if state == Status.EXPIRED:
        raise ApiError(
            status.HTTP_410_GONE,
            "invitation_expired",
            "This invitation has expired. Ask for a new one.",
        )
    if state == Status.ACCEPTED:
        raise _conflict("invitation_accepted", "This invitation has already been used.")
    if state == Status.REVOKED:
        raise ApiError(status.HTTP_410_GONE, "invitation_revoked", "This invitation was cancelled.")
    if invitation.email != normalize(user.email):
        raise ApiError(
            status.HTTP_403_FORBIDDEN,
            "wrong_account",
            f"This invitation is for {invitation.email}. Sign in with that account to accept it.",
        )
    if not user.email_verified:
        raise ApiError(
            status.HTTP_403_FORBIDDEN, "email_unverified", "Confirm your email address first."
        )
    if membership_of(user) is not None:
        raise already_in_family()
    try:
        with transaction.atomic():
            # Only one request can flip it from pending, so a link works once.
            claimed = Invitation.objects.filter(pk=invitation.pk, status=Status.PENDING).update(
                status=Status.ACCEPTED
            )
            if not claimed:
                raise _conflict("invitation_accepted", "This invitation has already been used.")
            Membership.objects.create(
                family=invitation.family,
                user=user,
                role=invitation.role,
            )
    except IntegrityError:
        raise already_in_family() from None
    return dashboard(user, today=today)
