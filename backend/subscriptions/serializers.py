"""Request and response shapes for subscriptions, analytics and the AI epic
(handoff 04 §5, §6a). This file is the frozen contract: the mobile client is
generated from the schema these produce.

Conventions (spec section 5): money is a decimal string, amounts computed by the
server travel as {amount, currency} in the user's display currency, dates are
YYYY-MM-DD, instants ISO 8601 UTC, ids opaque strings. No response carries a
number the client has to add up.
"""

from rest_framework import serializers

from core.contract import MoneySerializer

from .models import Category, Subscription
from .services.cycles import CUSTOM_UNITS, CYCLES, Cycle
from .services.validation import (
    PAYMENT_LABEL_MAX,
    PRICE_MESSAGE,
    is_valid_price,
    looks_like_card_number,
)

NOTES_MAX = 280  # 07 §2
CARD_NUMBER_MESSAGE = "Enter a label such as 'Visa ••4242', not a card number."
STATUSES = (Subscription.Status.ACTIVE, Subscription.Status.CANCELLED)
TRIAL_DECISIONS = tuple(Subscription.TrialDecision.values)

# Shared pieces --------------------------------------------------------------


class CategoryRefSerializer(serializers.Serializer):
    slug = serializers.CharField()
    display_name = serializers.CharField()
    color_token_key = serializers.CharField(
        help_text="Key into the mobile theme's category colours."
    )


class ServiceMarkSerializer(serializers.Serializer):
    """The tile drawn for a known service (04 §4.7). Null for services not in the catalog."""

    mark = serializers.CharField()
    brand_hex = serializers.CharField()
    tint_hex = serializers.CharField()


class CycleFieldsMixin(serializers.Serializer):
    billing_cycle = serializers.ChoiceField(choices=CYCLES)
    custom_cycle_count = serializers.IntegerField(allow_null=True)
    custom_cycle_unit = serializers.ChoiceField(choices=CUSTOM_UNITS, allow_null=True)


# Subscriptions: requests -----------------------------------------------------

_PRICE_ERRORS = {
    key: PRICE_MESSAGE
    for key in (
        "required",
        "null",
        "invalid",
        "max_digits",
        "max_decimal_places",
        "max_whole_digits",
        "max_string_length",
    )
}


class SubscriptionInputSerializer(serializers.Serializer):
    """POST /subscriptions, PATCH /subscriptions/{id} (partial), POST /extractions/{id}/confirm."""

    name = serializers.CharField(
        max_length=100, error_messages={"required": "Enter a name.", "blank": "Enter a name."}
    )
    billing_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, error_messages=_PRICE_ERRORS
    )
    billing_currency = serializers.RegexField(
        r"^[A-Z]{3}$",
        default="USD",
        error_messages={"invalid": "Choose a currency."},
        help_text="ISO 4217 code the subscription is billed in.",
    )
    billing_cycle = serializers.ChoiceField(choices=CYCLES, default="monthly")
    custom_cycle_count = serializers.IntegerField(
        min_value=1, max_value=365, required=False, allow_null=True
    )
    custom_cycle_unit = serializers.ChoiceField(
        choices=CUSTOM_UNITS, required=False, allow_null=True
    )
    start_date = serializers.DateField(
        error_messages={"required": "Choose a start date.", "null": "Choose a start date."},
        help_text="The first charge. next_bill_date is derived from it, never sent.",
    )
    category = serializers.SlugRelatedField(
        slug_field="slug",
        queryset=Category.objects.all(),
        error_messages={
            "required": "Choose a category.",
            "null": "Choose a category.",
            "does_not_exist": "Choose a category.",
        },
        help_text="Category slug, e.g. `entertainment`.",
    )
    notes = serializers.CharField(
        max_length=NOTES_MAX, required=False, allow_blank=True, default=""
    )
    payment_label = serializers.CharField(
        max_length=PAYMENT_LABEL_MAX,
        required=False,
        allow_blank=True,
        default="",
        help_text="Display only, e.g. 'Visa ••4242'. A card number is rejected.",
    )
    is_trial = serializers.BooleanField(required=False, default=False)
    trial_ends_on = serializers.DateField(required=False, allow_null=True)
    trial_length_days = serializers.IntegerField(
        min_value=1, max_value=366, required=False, allow_null=True
    )
    trial_reminder_enabled = serializers.BooleanField(required=False, default=True)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter a name.")
        return value

    def validate_billing_price(self, value):
        if not is_valid_price(value):
            raise serializers.ValidationError(PRICE_MESSAGE)
        return value

    def validate_payment_label(self, value):
        if value and looks_like_card_number(value):
            raise serializers.ValidationError(CARD_NUMBER_MESSAGE)
        return value

    def validate(self, attrs):
        # A partial update is checked against the stored subscription by the
        # model's full_clean; here only what was sent is checked together.
        if not self.partial:
            try:
                Cycle(
                    attrs.get("billing_cycle", "monthly"),
                    attrs.get("custom_cycle_count"),
                    attrs.get("custom_cycle_unit"),
                )
            except ValueError as error:
                raise serializers.ValidationError({"billing_cycle": [str(error)]}) from None
            if attrs.get("is_trial") and not (
                attrs.get("trial_ends_on") and attrs.get("trial_length_days")
            ):
                raise serializers.ValidationError(
                    {"trial_ends_on": ["A trial needs an end date and a length."]}
                )
        return attrs


class TrialDecisionInputSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=TRIAL_DECISIONS)


# Subscriptions: responses ----------------------------------------------------


class HistoryValueSerializer(serializers.Serializer):
    """The fields an event changed. Only the keys the event touched are present."""

    price = serializers.CharField(required=False, help_text="Decimal string.")
    currency = serializers.CharField(required=False)
    category = serializers.CharField(required=False, allow_null=True, help_text="Category slug.")
    billing_cycle = serializers.ChoiceField(choices=CYCLES, required=False)
    custom_cycle_count = serializers.IntegerField(required=False, allow_null=True)
    custom_cycle_unit = serializers.ChoiceField(
        choices=CUSTOM_UNITS, required=False, allow_null=True
    )
    cancelled_on = serializers.DateField(required=False)

    def to_representation(self, instance):
        # A nullable field would otherwise come out as null when the key is absent.
        data = super().to_representation(instance)
        return {key: value for key, value in data.items() if key in instance}


class HistoryEventSerializer(serializers.Serializer):
    id = serializers.CharField()
    event_type = serializers.ChoiceField(
        choices=["created", "price_change", "category_change", "cycle_change", "cancelled"]
    )
    occurred_at = serializers.DateTimeField()
    old_value = HistoryValueSerializer(allow_null=True)
    new_value = HistoryValueSerializer(allow_null=True)


class SubscriptionSerializer(CycleFieldsMixin):
    """One row of the subscription list."""

    id = serializers.CharField()
    name = serializers.CharField()
    billing_price = serializers.CharField(
        help_text="As billed, in billing_currency. Decimal string."
    )
    billing_currency = serializers.CharField()
    start_date = serializers.DateField()
    next_bill_date = serializers.DateField(
        allow_null=True, help_text="Derived from start_date and the cycle. Null once cancelled."
    )
    category = CategoryRefSerializer(allow_null=True)
    notes = serializers.CharField(allow_blank=True)
    payment_label = serializers.CharField(allow_blank=True)
    status = serializers.ChoiceField(choices=STATUSES)
    cancelled_on = serializers.DateField(allow_null=True)
    is_trial = serializers.BooleanField()
    trial_ends_on = serializers.DateField(allow_null=True)
    trial_length_days = serializers.IntegerField(allow_null=True)
    trial_reminder_enabled = serializers.BooleanField()
    trial_decision = serializers.ChoiceField(choices=TRIAL_DECISIONS)
    counts_toward_totals = serializers.BooleanField(
        help_text="False for cancelled subscriptions and trials that have not converted."
    )
    normalized_monthly = MoneySerializer(
        allow_null=True,
        help_text="Monthly equivalent in the display currency. Null when no FX rate exists.",
    )
    service_mark = ServiceMarkSerializer(allow_null=True)
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()


class SubscriptionDetailSerializer(SubscriptionSerializer):
    total_spent_to_date = MoneySerializer(
        allow_null=True,
        help_text="Everything charged before today, in the display currency.",
    )
    saved_per_year = MoneySerializer(
        allow_null=True, help_text="Annual equivalent no longer paid. Set only when cancelled."
    )
    history = HistoryEventSerializer(many=True, help_text="Newest first.")


class SubscriptionListSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.CharField(
        allow_null=True, help_text="Cursor for the next page; null on the last."
    )
    results = SubscriptionSerializer(many=True)


# Analytics -------------------------------------------------------------------


class CategorySpendSerializer(serializers.Serializer):
    category = CategoryRefSerializer(allow_null=True)
    amount = MoneySerializer(help_text="Rounded so the rows sum to monthly_total exactly.")
    percent = serializers.IntegerField(help_text="Whole percent; the rows sum to exactly 100.")
    share = serializers.CharField(help_text="Exact share to two places, e.g. '42.56'.")


class SummarySerializer(serializers.Serializer):
    period = serializers.ChoiceField(choices=["current_month"])
    display_currency = serializers.CharField()
    monthly_total = MoneySerializer()
    annual_total = MoneySerializer()
    active_count = serializers.IntegerField(help_text="Subscriptions counted in the totals.")
    trial_count = serializers.IntegerField(
        help_text="Trials not yet converted; never in the totals."
    )
    pending_trials_monthly = MoneySerializer(
        help_text="What the trials would add per month if they all converted. Shown apart."
    )
    unconverted_count = serializers.IntegerField(
        help_text="Subscriptions left out because their currency has no FX rate."
    )
    rates_as_of = serializers.DateField(allow_null=True)
    categories = CategorySpendSerializer(many=True, help_text="Largest first.")


class MonthSpendSerializer(serializers.Serializer):
    month = serializers.CharField(help_text="YYYY-MM.")
    amount = MoneySerializer(
        help_text="Monthly recurring spend as it stood at the end of the month."
    )


class SpendOverTimeSerializer(serializers.Serializer):
    display_currency = serializers.CharField()
    months = MonthSpendSerializer(
        many=True, help_text="Oldest first; the last is the current month."
    )
    current = MoneySerializer()
    previous = MoneySerializer(allow_null=True)
    delta_percent = serializers.CharField(
        allow_null=True, help_text="Change from the previous month to one place, e.g. '1.2'."
    )
    direction = serializers.ChoiceField(choices=["up", "down", "flat"], allow_null=True)
    enough_history = serializers.BooleanField(
        help_text="False under two months of tracking: show the placeholder, not a chart."
    )


class UpcomingBillSerializer(serializers.Serializer):
    subscription_id = serializers.CharField()
    name = serializers.CharField()
    category = CategoryRefSerializer(allow_null=True)
    service_mark = ServiceMarkSerializer(allow_null=True)
    bill_date = serializers.DateField()
    days_until = serializers.IntegerField(help_text="0 is today; negative is in the past.")
    amount = MoneySerializer(allow_null=True, help_text="What is charged, in the display currency.")
    billing_amount = MoneySerializer(help_text="What is charged, in the billing currency.")
    is_trial = serializers.BooleanField(help_text="True when this bill is a trial converting.")


class UpcomingSerializer(serializers.Serializer):
    display_currency = serializers.CharField()
    start = serializers.DateField()
    end = serializers.DateField(help_text="Inclusive.")
    items = UpcomingBillSerializer(many=True, help_text="By date, soonest first.")


class PriceChangeSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=["price_change", "trial_ending"])
    subscription_id = serializers.CharField()
    name = serializers.CharField()
    service_mark = ServiceMarkSerializer(allow_null=True)
    effective_on = serializers.DateField()
    is_upcoming = serializers.BooleanField()
    old_price = MoneySerializer(allow_null=True, help_text="Billing currency. Null for a trial.")
    new_price = MoneySerializer(
        help_text="Billing currency. For a trial, the price it converts to."
    )
    monthly_change = MoneySerializer(
        allow_null=True, help_text="Signed, display currency. Null for a trial."
    )
    annual_change = MoneySerializer(
        allow_null=True, help_text="Signed, display currency, e.g. '18.00'. Null for a trial."
    )
    direction = serializers.ChoiceField(choices=["up", "down"], allow_null=True)
    days_left = serializers.IntegerField(allow_null=True, help_text="Trials only.")


class PriceChangesSerializer(serializers.Serializer):
    display_currency = serializers.CharField()
    items = PriceChangeSerializer(many=True, help_text="Newest effective date first.")


# Trials (§6a) ---------------------------------------------------------------


class TrialSerializer(CycleFieldsMixin):
    subscription_id = serializers.CharField()
    name = serializers.CharField()
    category = CategoryRefSerializer(allow_null=True)
    service_mark = ServiceMarkSerializer(allow_null=True)
    price = MoneySerializer(help_text="The price after the trial, in the billing currency.")
    trial_ends_on = serializers.DateField()
    trial_length_days = serializers.IntegerField()
    days_left = serializers.IntegerField()
    elapsed_days = serializers.IntegerField()
    progress = serializers.FloatField(help_text="elapsed_days / trial_length_days, 0 to 1.")
    urgency = serializers.ChoiceField(
        choices=["soon", "later", "far"],
        help_text="soon: inside alert_days_before; later: within 14 days; far: beyond.",
    )
    at_risk = serializers.BooleanField(help_text="Inside the alert window and not marked Keep.")
    decision = serializers.ChoiceField(choices=TRIAL_DECISIONS)
    reminder_enabled = serializers.BooleanField()
    reminder_on = serializers.DateField(help_text="trial_ends_on minus alert_days_before.")


class AtRiskSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    amount = MoneySerializer(help_text="What the at-risk trials will charge, display currency.")


class TrialListSerializer(serializers.Serializer):
    display_currency = serializers.CharField()
    alert_days_before = serializers.IntegerField()
    at_risk = AtRiskSerializer()
    results = TrialSerializer(many=True, help_text="Fewest days left first.")


# Shared plans (§6a) -----------------------------------------------------------


class ParticipantSerializer(serializers.Serializer):
    id = serializers.CharField()
    payment_id = serializers.CharField(help_text="This period's payment; used by the remind route.")
    display_name = serializers.CharField()
    email = serializers.EmailField(allow_null=True)
    position = serializers.IntegerField(help_text="0 is the owner.")
    is_owner = serializers.BooleanField()
    share = MoneySerializer(help_text="Largest-remainder split; shares sum to the price exactly.")
    status = serializers.ChoiceField(choices=["paid", "pending"])
    paid_at = serializers.DateTimeField(allow_null=True)
    last_reminded_at = serializers.DateTimeField(allow_null=True)


class SharedPlanSerializer(CycleFieldsMixin):
    id = serializers.CharField()
    subscription_id = serializers.CharField()
    name = serializers.CharField()
    service_mark = ServiceMarkSerializer(allow_null=True)
    price = MoneySerializer(help_text="The full bill, in the billing currency.")
    split_mode = serializers.ChoiceField(choices=["equal"])
    period = serializers.CharField(help_text="Billing period the payments are for, YYYY-MM.")
    participant_count = serializers.IntegerField()
    paid_count = serializers.IntegerField()
    your_share = MoneySerializer()
    participants = ParticipantSerializer(many=True, help_text="By position, owner first.")


class SharedPlanListSerializer(serializers.Serializer):
    display_currency = serializers.CharField()
    outstanding = MoneySerializer(
        help_text="Other participants' pending shares, owed to you. Display currency."
    )
    results = SharedPlanSerializer(many=True)


class NewParticipantSerializer(serializers.Serializer):
    display_name = serializers.CharField(max_length=60)
    email = serializers.EmailField(required=False, allow_null=True)


class SharedPlanInputSerializer(serializers.Serializer):
    subscription_id = serializers.CharField()
    split_mode = serializers.ChoiceField(choices=["equal"], default="equal")
    participants = NewParticipantSerializer(
        many=True, min_length=1, max_length=19, help_text="Everyone but you; you are added first."
    )


class ReminderSerializer(serializers.Serializer):
    payment_id = serializers.CharField()
    channel = serializers.ChoiceField(
        choices=["email", "share_sheet"],
        help_text="email: sent by the server. share_sheet: open the OS share sheet with `message`.",
    )
    message = serializers.CharField()
    last_reminded_at = serializers.DateTimeField()
    next_reminder_available_at = serializers.DateTimeField(help_text="One reminder per 24 hours.")


# Extractions (§6a) -----------------------------------------------------------


class ExtractionSourceSerializer(serializers.Serializer):
    sender = serializers.CharField()
    subject = serializers.CharField()
    snippet = serializers.CharField(help_text="At most 300 characters; deleted with the record.")


class ExtractedFieldsSerializer(serializers.Serializer):
    """Every value is null when it was not found in the email (the grounding rule)."""

    service_name = serializers.CharField(allow_null=True)
    plan_name = serializers.CharField(allow_null=True)
    price = serializers.CharField(allow_null=True, help_text="Decimal string.")
    currency = serializers.CharField(allow_null=True)
    billing_cycle = serializers.ChoiceField(choices=CYCLES, allow_null=True)
    custom_cycle_count = serializers.IntegerField(allow_null=True)
    custom_cycle_unit = serializers.ChoiceField(choices=CUSTOM_UNITS, allow_null=True)
    subscription_type = serializers.ChoiceField(choices=["paid", "trial"], allow_null=True)
    trial_ends_on = serializers.DateField(allow_null=True)
    start_date = serializers.DateField(allow_null=True)
    category = serializers.CharField(allow_null=True, help_text="Category slug.")


class ExtractionConfidenceSerializer(serializers.Serializer):
    """Computed from checks, not self-reported, 0 to 1; null where the field is null."""

    service_name = serializers.FloatField(allow_null=True)
    plan_name = serializers.FloatField(allow_null=True)
    price = serializers.FloatField(allow_null=True)
    currency = serializers.FloatField(allow_null=True)
    billing_cycle = serializers.FloatField(allow_null=True)
    subscription_type = serializers.FloatField(allow_null=True)
    trial_ends_on = serializers.FloatField(allow_null=True)
    start_date = serializers.FloatField(allow_null=True)
    category = serializers.FloatField(allow_null=True)


class PendingExtractionSerializer(serializers.Serializer):
    id = serializers.CharField()
    source = ExtractionSourceSerializer()
    fields = ExtractedFieldsSerializer()
    confidence = ExtractionConfidenceSerializer()
    flagged = serializers.ListField(
        child=serializers.CharField(),
        help_text="Fields under 60% confidence or not grounded; must be resolved before confirm.",
    )
    duplicate_of = serializers.CharField(
        allow_null=True, help_text="Id of an existing subscription this matches; offer Update."
    )
    created_at = serializers.DateTimeField()
    expires_at = serializers.DateTimeField()


class PendingExtractionListSerializer(serializers.Serializer):
    scanning = serializers.BooleanField(help_text="True while a scan is still running.")
    results = PendingExtractionSerializer(many=True)


class ScanSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["scanning"])


# Gmail (§6a) ------------------------------------------------------------------


class GmailConnectInputSerializer(serializers.Serializer):
    code = serializers.CharField(help_text="OAuth authorization code from the consent screen.")
    code_verifier = serializers.CharField(required=False, help_text="PKCE verifier.")
    redirect_uri = serializers.CharField()


class GmailConnectionSerializer(serializers.Serializer):
    provider = serializers.ChoiceField(choices=["gmail"])
    email = serializers.EmailField()
    connected_at = serializers.DateTimeField()
