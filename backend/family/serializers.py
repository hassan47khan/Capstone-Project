"""Family shapes (handoff 10). Money is {amount, currency} in the family's
display currency, rounded by the server."""

from rest_framework import serializers

from accounts.services.timezones import is_valid_timezone
from core.contract import MoneySerializer
from subscriptions.fx import SUPPORTED_CURRENCIES
from subscriptions.models import PRICE_DIGITS
from subscriptions.serializers import CategoryRefSerializer, ServiceMarkSerializer

from .models import Family, Invitation, Membership

ROLES = Membership.Role.values


class YouSerializer(serializers.Serializer):
    """What the caller may do, with their role applied (a viewer may do nothing)."""

    membership_id = serializers.CharField()
    role = serializers.ChoiceField(choices=ROLES)
    may_add_subscriptions = serializers.BooleanField()
    may_edit_subscriptions = serializers.BooleanField()
    may_view_family_total = serializers.BooleanField()


class PersonFields(serializers.Serializer):
    id = serializers.CharField(help_text="The membership id.")
    user_id = serializers.CharField()
    name = serializers.CharField()
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=ROLES)
    is_you = serializers.BooleanField()


class FamilyMemberSerializer(PersonFields):
    subscription_count = serializers.IntegerField(
        help_text="What counts toward their total: active, not a running trial."
    )
    total = MoneySerializer(
        allow_null=True,
        help_text=(
            "Monthly, in the family's currency. Rows add up to the family total. "
            "Null for other members when you can't see the family total."
        ),
    )
    spending_limit = MoneySerializer(allow_null=True, help_text="Monthly. Null means no limit.")
    over_limit = serializers.BooleanField(allow_null=True)


INVITATION_STATUSES = Invitation.Status.values


class InvitationSerializer(serializers.Serializer):
    id = serializers.CharField()
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=ROLES)
    status = serializers.ChoiceField(choices=INVITATION_STATUSES)
    expires_at = serializers.DateTimeField()
    sent_at = serializers.DateTimeField()


class FamilySerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    plan = serializers.ChoiceField(choices=Family.Plan.values)
    seat_limit = serializers.IntegerField()
    seats_used = serializers.IntegerField()
    seats_taken = serializers.IntegerField(
        help_text="Members plus invitations still pending: what the seat limit counts."
    )
    can_invite = serializers.BooleanField(
        help_text="False for non-admins and when every seat is taken (show the upgrade prompt)."
    )
    invitations = InvitationSerializer(
        many=True, help_text="Pending and expired invitations. Admins only; empty otherwise."
    )
    display_currency = serializers.CharField()
    shared_timezone = serializers.CharField(allow_blank=True)
    fiscal_year_start = serializers.IntegerField(min_value=1, max_value=12)
    you = YouSerializer()
    total = MoneySerializer(
        allow_null=True,
        help_text=(
            "Every member's monthly total, in the family's currency. Null without permission."
        ),
    )
    unconverted_count = serializers.IntegerField(
        help_text="Subscriptions left out of the total because their currency has no rate."
    )
    members = FamilyMemberSerializer(many=True)


class FamilySubscriptionSerializer(serializers.Serializer):
    """One of a member's subscriptions. A private one, seen by someone else,
    keeps only its amount (10 §2 option A): show it as "Private subscription"."""

    id = serializers.CharField(allow_null=True)
    name = serializers.CharField(allow_null=True)
    is_private = serializers.BooleanField()
    service_mark = ServiceMarkSerializer(allow_null=True)
    category = CategoryRefSerializer(allow_null=True)
    next_bill_date = serializers.DateField(allow_null=True)
    billing_price = MoneySerializer(allow_null=True, help_text="As billed. Null when private.")
    monthly = MoneySerializer(
        allow_null=True,
        help_text=(
            "In the family's currency; rows add up to the member's total. Null without a rate."
        ),
    )


class FamilyMemberDetailSerializer(PersonFields):
    can_add_subscriptions = serializers.BooleanField()
    can_edit_own_subs = serializers.BooleanField()
    can_view_family_total = serializers.BooleanField()
    joined_at = serializers.DateTimeField()
    spending_limit = MoneySerializer(allow_null=True)
    over_limit = serializers.BooleanField()
    total = MoneySerializer()
    unconverted_count = serializers.IntegerField()
    subscriptions = FamilySubscriptionSerializer(many=True)


def _currency(value: str) -> str:
    if value not in SUPPORTED_CURRENCIES:
        raise serializers.ValidationError("Choose a currency.")
    return value


class FamilyCreateSerializer(serializers.Serializer):
    name = serializers.CharField(
        max_length=60,
        error_messages={"blank": "Name your family.", "required": "Name your family."},
    )
    display_currency = serializers.CharField(
        required=False, help_text="Defaults to yours.", validators=[_currency]
    )

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name your family.")
        return value


class FamilyUpdateSerializer(FamilyCreateSerializer):
    shared_timezone = serializers.CharField(max_length=64, required=False, allow_blank=True)
    fiscal_year_start = serializers.IntegerField(
        min_value=1, max_value=12, required=False, help_text="Month, 1-12."
    )

    def validate_shared_timezone(self, value):
        if value and not is_valid_timezone(value):
            raise serializers.ValidationError("Choose a time zone.")
        return value


class MemberUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=ROLES, required=False)
    can_add_subscriptions = serializers.BooleanField(required=False)
    can_edit_own_subs = serializers.BooleanField(required=False)
    can_view_family_total = serializers.BooleanField(required=False)
    spending_limit = serializers.DecimalField(
        **PRICE_DIGITS,
        min_value=0,
        required=False,
        allow_null=True,
        help_text="Monthly, in the family's currency. Null removes it.",
    )


class InviteInputSerializer(serializers.Serializer):
    email = serializers.EmailField(
        error_messages={"invalid": "Enter a valid email.", "required": "Enter an email."}
    )
    role = serializers.ChoiceField(choices=ROLES, default=Membership.Role.MEMBER)


class InvitationTokenSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=200, help_text="From the invitation link.")


PROBLEMS = [
    "expired",
    "accepted",
    "revoked",
    "wrong_account",
    "already_member",
    "in_another_family",
]


class InvitationPreviewSerializer(serializers.Serializer):
    family_name = serializers.CharField()
    invited_by = serializers.CharField()
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=ROLES)
    status = serializers.ChoiceField(choices=INVITATION_STATUSES)
    expires_at = serializers.DateTimeField()
    problem = serializers.ChoiceField(
        choices=PROBLEMS,
        allow_null=True,
        help_text="Why it can't be accepted by the signed-in user; null when it can.",
    )
