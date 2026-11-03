"""The family checks every subscription write goes through (10 §4).

A permission that only hides a button isn't one: a viewer calling
POST /subscriptions directly gets the same 403 as the UI would imply.
Someone in no family is never limited.
"""

from rest_framework import status

from core.contract import ApiError

from .models import Membership

CANNOT_ADD = "family_cannot_add"
CANNOT_EDIT = "family_cannot_edit"


def membership_of(user) -> Membership | None:
    return Membership.objects.filter(user=user).select_related("family").first()


def require_add(user) -> None:
    membership = membership_of(user)
    if membership is not None and not membership.may_add:
        raise ApiError(
            status.HTTP_403_FORBIDDEN,
            CANNOT_ADD,
            "Your family admin hasn't let you add subscriptions.",
        )


def require_edit(user) -> None:
    membership = membership_of(user)
    if membership is not None and not membership.may_edit:
        raise ApiError(
            status.HTTP_403_FORBIDDEN,
            CANNOT_EDIT,
            "Your family admin hasn't let you change your subscriptions.",
        )
