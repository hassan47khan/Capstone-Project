"""Family plans (handoff 10 §1). Three collections: families, memberships and
(part 2) invitations.

A family never owns a subscription. Each subscription keeps its one owner, so
removing a member or deleting the family can't orphan or delete anything
(10 §4): their subscriptions simply stop being counted in the family total.
"""

from django.conf import settings
from django.db import models

from subscriptions.models import PRICE_DIGITS

DEFAULT_SEATS = 5


class Family(models.Model):
    class Plan(models.TextChoices):
        FREE = "free"
        PREMIUM = "premium"

    name = models.CharField(max_length=60)
    plan = models.CharField(max_length=10, choices=Plan.choices, default=Plan.FREE)
    seat_limit = models.PositiveSmallIntegerField(default=DEFAULT_SEATS)
    # Who created it. Admin rights come from Membership.role, not from this.
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    # The family total is always in this currency (10 §5).
    display_currency = models.CharField(max_length=3, default="USD")
    shared_timezone = models.CharField(max_length=64, blank=True, default="")
    # 1-12. "Fiscal year start", never "fiscal month start" (10 §3.7).
    fiscal_year_start = models.PositiveSmallIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "families"

    def __str__(self):
        return self.name


class Membership(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin"
        MEMBER = "member"
        VIEWER = "viewer"

    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name="memberships")
    # One family per user (10 §5: "already in another family" is blocked).
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="family_membership"
    )
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.MEMBER)
    # 10 §1. A viewer is read-only whatever these say; an admin can do everything.
    can_add_subscriptions = models.BooleanField(default=True)
    can_edit_own_subs = models.BooleanField(default=True)
    can_view_family_total = models.BooleanField(default=True)
    # Monthly, in the family's currency. Null means no limit.
    spending_limit = models.DecimalField(**PRICE_DIGITS, null=True, blank=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "family_memberships"
        indexes = [models.Index(fields=["family", "joined_at"], name="membership_family")]

    def __str__(self):
        return f"{self.user_id} in {self.family_id} ({self.role})"

    @property
    def is_admin(self) -> bool:
        return self.role == self.Role.ADMIN

    @property
    def may_add(self) -> bool:
        if self.role == self.Role.VIEWER:
            return False
        return self.is_admin or self.can_add_subscriptions

    @property
    def may_edit(self) -> bool:
        if self.role == self.Role.VIEWER:
            return False
        return self.is_admin or self.can_edit_own_subs

    @property
    def may_see_total(self) -> bool:
        return self.is_admin or self.can_view_family_total


class Invitation(models.Model):
    """An emailed invite to join a family (10 §3.5). Only the SHA-256 of the
    token is stored, like an email link (accounts.EmailLinkToken).

    `status` is what was decided; a pending invite past `expires_at` is
    reported as expired without a job having to flip it.
    """

    class Status(models.TextChoices):
        PENDING = "pending"
        ACCEPTED = "accepted"
        EXPIRED = "expired"
        REVOKED = "revoked"

    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name="invitations")
    email = models.EmailField()
    role = models.CharField(
        max_length=10, choices=Membership.Role.choices, default=Membership.Role.MEMBER
    )
    digest = models.CharField(max_length=64, unique=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    expires_at = models.DateTimeField()
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField()

    class Meta:
        db_table = "family_invitations"
        indexes = [models.Index(fields=["family", "status"], name="invitation_family_status")]
        constraints = [
            # One live invitation per address per family, so two quick taps on
            # Invite can't both create one. An expired invite keeps `pending`
            # in storage, so `invite()` stores it as expired before inviting again.
            models.UniqueConstraint(
                fields=["family", "email"],
                condition=models.Q(status="pending"),
                name="pending_invitation_per_email",
            )
        ]

    def __str__(self):
        return f"invite {self.email} to {self.family_id} ({self.status})"

    def status_at(self, now) -> str:
        if self.status == self.Status.PENDING and self.expires_at <= now:
            return self.Status.EXPIRED
        return self.status
