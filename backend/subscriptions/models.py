from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django_mongodb_backend.fields import (
    EmbeddedModelArrayField,
    EmbeddedModelField,
    ObjectIdField,
)
from django_mongodb_backend.indexes import EmbeddedFieldIndex
from django_mongodb_backend.managers import MongoManager
from django_mongodb_backend.models import EmbeddedModel

from .services.cycles import CUSTOM_UNITS, CYCLES, Cycle
from .services.validation import (
    PAYMENT_LABEL_MAX,
    PRICE_MESSAGE,
    is_valid_price,
    looks_like_card_number,
)

# Money columns. DecimalField is stored as BSON Decimal128, which round-trips
# Python's Decimal exactly (asserted in test_models), so no float ever touches
# a price. Two places are enough for every stored price; computed values such
# as Headspace's 6.495 are never stored (handoff 04 §2).
PRICE_DIGITS = {"max_digits": 10, "decimal_places": 2}


class Category(models.Model):
    """One taxonomy, used everywhere: exactly the seven system slugs (handoff 04 §1)."""

    slug = models.SlugField(max_length=40, unique=True)
    display_name = models.CharField(max_length=60)
    # A key into the mobile theme's category palette, never a hex value.
    color_token_key = models.CharField(max_length=40)
    is_system = models.BooleanField(default=False)

    class Meta:
        db_table = "categories"

    def __str__(self):
        return self.display_name


class ServiceCatalogEntry(models.Model):
    """Prefill for the Add Subscription picker (handoff 04 §4.7, 07 §2)."""

    name = models.CharField(max_length=100, unique=True)
    default_price = models.DecimalField(**PRICE_DIGITS)
    default_currency = models.CharField(max_length=3, default="USD")
    billing_cycle = models.CharField(max_length=10, default="monthly")
    custom_cycle_count = models.PositiveSmallIntegerField(null=True, blank=True)
    custom_cycle_unit = models.CharField(max_length=10, null=True, blank=True)  # noqa: DJ001
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="+")
    brand_hex = models.CharField(max_length=7)
    tint_hex = models.CharField(max_length=7)
    mark = models.CharField(max_length=2)

    class Meta:
        db_table = "service_catalog"

    def __str__(self):
        return self.name


class FxRate(models.Model):
    """Units of `currency` per one US dollar, for display conversion only."""

    currency = models.CharField(max_length=3, unique=True)
    rate = models.DecimalField(max_digits=18, decimal_places=8)
    as_of = models.DateTimeField()

    class Meta:
        db_table = "fx_rates"

    def __str__(self):
        return f"USD->{self.currency} {self.rate}"


class Participant(EmbeddedModel):
    email = models.EmailField()
    # Filled in when a verified user with this email claims the invitation.
    user_id = ObjectIdField(null=True, blank=True)


class Sharing(EmbeddedModel):
    split_method = models.CharField(max_length=20, default="equal")
    # Spec section 4 caps a shared plan at 20 participants.
    participants = EmbeddedModelArrayField(Participant, max_size=20, default=list)


class VisibleSubscriptionManager(MongoManager):
    """Leaves soft-deleted subscriptions out, so no screen can forget to (handoff 04 §2)."""

    def get_queryset(self):
        return super().get_queryset().exclude(status=Subscription.Status.DELETED)


class Subscription(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active"
        CANCELLED = "cancelled"
        DELETED = "deleted"

    class TrialDecision(models.TextChoices):
        NONE = "none"
        KEEP = "keep"
        REMIND = "remind"

    # A ForeignKey rather than a bare ObjectId so ownership is enforced by
    # Django and queries can filter on owner directly. Stored as `owner_id`.
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="subscriptions"
    )
    name = models.CharField(max_length=100)
    billing_price = models.DecimalField(**PRICE_DIGITS)
    billing_currency = models.CharField(max_length=3, default="USD")
    billing_cycle = models.CharField(
        max_length=10, choices=[(c, c) for c in CYCLES], default="monthly"
    )
    custom_cycle_count = models.PositiveSmallIntegerField(null=True, blank=True)
    custom_cycle_unit = models.CharField(  # noqa: DJ001 - null means "not a custom cycle"
        max_length=10, choices=[(u, u) for u in CUSTOM_UNITS], null=True, blank=True
    )
    # The first charge. Shares its day-of-month with every later bill.
    start_date = models.DateField()
    # Derived from start_date + cycle by operations.refresh_next_bill_date;
    # stored only so lists can sort and filter on it in MongoDB.
    next_bill_date = models.DateField(null=True, blank=True)
    category = models.ForeignKey(
        Category, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    notes = models.TextField(blank=True, default="")
    # Display only, e.g. "Visa ••4242". Never a card number (handoff 04 §1).
    payment_label = models.CharField(max_length=PAYMENT_LABEL_MAX, blank=True, default="")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    # What Restore (the Undo toast) puts back after a soft delete.
    status_before_delete = models.CharField(  # noqa: DJ001 - null means "not deleted"
        max_length=10, choices=Status.choices, null=True, blank=True
    )
    cancelled_on = models.DateField(null=True, blank=True)
    # Trials (handoff 04 §6a). billing_price is the price after the trial.
    is_trial = models.BooleanField(default=False)
    trial_ends_on = models.DateField(null=True, blank=True)
    trial_length_days = models.PositiveSmallIntegerField(null=True, blank=True)
    trial_reminder_enabled = models.BooleanField(default=True)
    trial_decision = models.CharField(
        max_length=10, choices=TrialDecision.choices, default=TrialDecision.NONE
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # Embedded: participants are always read with their plan and are bounded.
    sharing = EmbeddedModelField(Sharing, null=True, blank=True)

    # The first manager is Django's default, so the filtered one goes first.
    objects = VisibleSubscriptionManager()
    # Includes soft-deleted rows. Only Restore, purge and history should use it.
    # DJ012 is a false positive: ruff reads VisibleSubscriptionManager() above
    # as a field, not a manager.
    all_objects = MongoManager()  # noqa: DJ012

    class Meta:
        db_table = "subscriptions"
        base_manager_name = "all_objects"
        indexes = [
            # Serves claiming invitations at registration (spec section 4).
            # Since backend 6.1, an index on a field inside an embedded model
            # must be declared here, on the top-level model, with
            # EmbeddedFieldIndex; a plain Index rejects the dotted path.
            EmbeddedFieldIndex(
                fields=["sharing.participants.email"],
                name="subs_participant_email",
            ),
            # The default list: a user's subscriptions by status, soonest bill first.
            models.Index(
                fields=["owner", "status", "next_bill_date"], name="subs_owner_status_bill"
            ),
            models.Index(fields=["owner", "category"], name="subs_owner_category"),
            # The trial-conversion job.
            models.Index(fields=["is_trial", "trial_ends_on"], name="subs_trial_ends"),
        ]

    def __str__(self):
        return self.name

    @property
    def cycle(self) -> Cycle:
        return Cycle(self.billing_cycle, self.custom_cycle_count, self.custom_cycle_unit)

    def clean(self):
        errors = {}
        self.name = (self.name or "").strip()
        if not self.name:
            errors["name"] = "Enter a name."
        if not is_valid_price(self.billing_price):
            errors["billing_price"] = PRICE_MESSAGE
        if self.start_date is None:
            errors["start_date"] = "Choose a start date."
        if self.category_id is None:
            errors["category"] = "Choose a category."
        if self.payment_label and looks_like_card_number(self.payment_label):
            errors["payment_label"] = "Enter a label such as 'Visa ••4242', not a card number."
        try:
            self.cycle  # noqa: B018 - validates the cycle fields together
        except ValueError as error:
            errors["billing_cycle"] = str(error)
        if self.is_trial and (self.trial_ends_on is None or not self.trial_length_days):
            errors["trial_ends_on"] = "A trial needs an end date and a length."
        if errors:
            raise ValidationError(errors)


class PriceHistoryEvent(models.Model):
    """Append-only history; drives the price chart, Edit History and price alerts.

    Values are JSON with money as decimal strings, e.g. {"price": "13.99",
    "currency": "USD"}. A price_change never crosses currencies: any change
    of currency is one currency_change from the old price and currency to the
    new ones, even if the price changed in the same edit. price_change events
    written before currency was recorded have only "price"
    (operations.price_events works out theirs).
    Kept when a subscription is soft-deleted; removed only by a purge.
    """

    class EventType(models.TextChoices):
        CREATED = "created"
        PRICE_CHANGE = "price_change"
        CURRENCY_CHANGE = "currency_change"
        CATEGORY_CHANGE = "category_change"
        CYCLE_CHANGE = "cycle_change"
        CANCELLED = "cancelled"

    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="history")
    event_type = models.CharField(max_length=20, choices=EventType.choices)
    occurred_at = models.DateTimeField()
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)

    # MongoManager adds raw_aggregate, which the analytics pipelines use.
    objects = MongoManager()

    class Meta:
        db_table = "price_history_events"
        ordering = ["occurred_at"]
        indexes = [
            models.Index(fields=["subscription", "occurred_at"], name="history_sub_time"),
            models.Index(fields=["event_type", "occurred_at"], name="history_type_time"),
        ]

    def __str__(self):
        return f"{self.event_type} @ {self.occurred_at:%Y-%m-%d}"


class IdempotencyKey(models.Model):
    """An `Idempotency-Key` a client sent with POST /subscriptions, and what it
    created (system design spec, data integrity practices).

    A retry with the same key and the same body gets the original subscription
    back instead of a second one. Keys are per user, unique on (owner, key),
    and a TTL index on `expires_at` (migration 0003) drops them after a day.
    """

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    key = models.CharField(max_length=255)
    # SHA-256 of the request body, so a reused key with a different body is caught.
    request_digest = models.CharField(max_length=64)
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        db_table = "idempotency_keys"
        constraints = [
            models.UniqueConstraint(fields=["owner", "key"], name="idempotency_key_per_owner")
        ]

    def __str__(self):
        return self.key
