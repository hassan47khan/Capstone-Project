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
