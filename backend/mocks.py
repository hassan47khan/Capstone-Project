"""Mock answers for the AI-epic endpoints (handoff 04 §6a, 11 §2): extractions,
trials, shared plans and Gmail. These belong to the 11 owner; auth,
subscriptions and analytics have been real since 04 slice 3.

Each view validates its request for real, calls one function in this module,
and serializes what it returns with the contract's serializers, so replacing a
function here changes nothing outside it.

How the mock answers
  - The signed-in user is always Alex Kim from the canonical dataset (04 §4),
    and "today" is always SEED_TODAY (2026-10-01). The dataset is loaded on
    first use if it is not in the database already, with no usable password:
    a request must never create an account anyone can log in to. Only
    `seed_demo` gives the demo users DEMO_PASSWORD.
  - Every figure is computed from that data through the money engine and
    `subscriptions.operations`, never typed in: Alex's $129.20, the category
    rollup, EUR 118.56, trials left out of totals, trial progress.
  - Writes run the real operation, read the result, then put the data back as
    it was (`_discarded`), so a mock create or edit returns exactly what the
    real one will, and the dataset never drifts between calls.
  - Extractions, shared plans and Gmail have no models yet (they are the 11
    owner's, §6a). Their payloads are fixed here, dated from SEED_TODAY, with
    money computed by the engine.
"""

from contextlib import contextmanager
from datetime import date, timedelta
from decimal import Decimal

from bson import ObjectId
from django.utils import timezone

from accounts.models import User
from core.contract import ApiError, money, not_found, rounded
from subscriptions import operations, presenters, seed
from subscriptions.models import PriceHistoryEvent, Subscription
from subscriptions.services import money as engine

TODAY = seed.SEED_TODAY
REMINDER_INTERVAL = timedelta(hours=24)
# A trial this many days or fewer from its end is "later"; beyond it, "far" (11 §2.5).
TRIAL_LATER_DAYS = 14

Status = Subscription.Status
Decision = Subscription.TrialDecision


# The mock user --------------------------------------------------------------


def demo_user() -> User:
    """Alex Kim, loading the canonical dataset the first time it is needed.
    Loaded this way, the demo users cannot log in (see seed.DEMO_PASSWORD)."""
    user = User.objects.filter(email=seed.ALEX.email).first()
    if user is None:
        user = seed.load_demo(today=TODAY)[seed.ALEX.email]
    return user


def _context(user: User) -> presenters.Context:
    return presenters.Context.for_user(user, today=TODAY)


def _owned(user: User, subscription_id: str, *, include_deleted=False) -> Subscription:
    """The caller's subscription, or 404, never 403, so ids cannot be probed."""
    if not ObjectId.is_valid(subscription_id):
        raise not_found()
    manager = Subscription.all_objects if include_deleted else Subscription.objects
    sub = manager.filter(owner=user, pk=ObjectId(subscription_id)).first()
    if sub is None:
        raise not_found()
    return sub


_SAVED_FIELDS = [f.attname for f in Subscription._meta.concrete_fields if not f.primary_key]


@contextmanager
def _discarded(sub: Subscription | None = None):
    """Let a real write happen, then undo it: restore `sub`'s fields, drop the
    history events written meanwhile, and delete whatever the caller appends
    to the yielded list. (The local single-node Mongo reports no transaction
    support, so a rollback cannot do this.)"""
    saved = {name: getattr(sub, name) for name in _SAVED_FIELDS} if sub else None
    before = (
        list(PriceHistoryEvent.objects.filter(subscription=sub).values_list("pk", flat=True))
        if sub
        else []
    )
    created = []
    try:
        yield created
    finally:
        for obj in created:
            obj.delete()
        if sub is not None:
            PriceHistoryEvent.objects.filter(subscription=sub).exclude(pk__in=before).delete()
            Subscription.all_objects.filter(pk=sub.pk).update(**saved)


def _pending_trial(sub: Subscription) -> bool:
    """A trial that has not converted yet: never in a total (04 §6a)."""
    return (
        sub.status == Status.ACTIVE
        and sub.is_trial
        and sub.trial_ends_on is not None
        and sub.trial_ends_on >= TODAY
    )


def _preview_create(fields: dict) -> dict:
    """What creating this subscription returns, without keeping it."""
    user = demo_user()
    with _discarded() as created:
        sub = operations.create_subscription(today=TODAY, owner=user, **fields)
        created.append(sub)
        return presenters.subscription_detail(sub, _context(user))


# Shared plans (04 §6a, 11 §2.6) ------------------------------------------------

SHARED_PLAN_ID = "6a0b00000000000000000001"
# id, payment id, and who: Alex owns Alex's Netflix and has paid the provider;
# Jordan has paid; Sam, with no email on file, has not (11 §2.6's frame).
_NETFLIX_SPLIT = (
    ("6a0b00000000000000000011", "6a0b00000000000000000021", seed.ALEX.name, seed.ALEX.email, True),
    (
        "6a0b00000000000000000012",
        "6a0b00000000000000000022",
        seed.JORDAN.name,
        seed.JORDAN.email,
        True,
    ),
    ("6a0b00000000000000000013", "6a0b00000000000000000023", seed.SAM.name, None, False),
)


def _plan(plan_id: str, sub: Subscription, people, ctx) -> dict:
    shares = engine.split_shares(sub.billing_price, len(people), sub.billing_currency)
    paid_at = operations.at_start_of(TODAY)
    participants = [
        {
            "id": pid,
            "payment_id": payment_id,
            "display_name": name,
            "email": email,
            "position": position,
            "is_owner": position == 0,
            "share": rounded(share, sub.billing_currency),
            "status": "paid" if paid else "pending",
            "paid_at": paid_at if paid else None,
            "last_reminded_at": None,
        }
        for position, ((pid, payment_id, name, email, paid), share) in enumerate(
            zip(people, shares, strict=True)
        )
    ]
    return {
        "id": plan_id,
        "subscription_id": str(sub.pk),
        "name": sub.name,
        "service_mark": ctx.marks.get(sub.name),
        "price": money(sub.billing_price, sub.billing_currency),
        **presenters.cycle_fields(sub.cycle),
        "split_mode": "equal",
        "period": f"{TODAY:%Y-%m}",
        "participant_count": len(participants),
        "paid_count": sum(1 for p in participants if p["status"] == "paid"),
        "your_share": participants[0]["share"],
        "participants": participants,
    }


def _netflix_plan(user, ctx) -> dict:
    netflix = Subscription.objects.get(owner=user, name="Netflix")
    return _plan(SHARED_PLAN_ID, netflix, _NETFLIX_SPLIT, ctx)


def shared_plans() -> dict:
    user = demo_user()
    ctx = _context(user)
    plan = _netflix_plan(user, ctx)
    owed = [
        ctx.convert(Decimal(p["share"]["amount"]), p["share"]["currency"])
        for p in plan["participants"]
        if not p["is_owner"] and p["status"] == "pending"
    ]
    return {
        "display_currency": ctx.currency,
        # Shares never change the user's totals (11 §2.6); this figure lives here only.
        "outstanding": money(sum((o for o in owed if o is not None), Decimal(0)), ctx.currency),
        "results": [plan],
    }


def create_shared_plan(subscription_id: str, participants: list[dict]) -> dict:
    user = demo_user()
    sub = _owned(user, subscription_id)
    if sub.name == "Netflix":
        raise ApiError(409, "already_shared", "This subscription is already shared.")
    people = [(str(ObjectId()), str(ObjectId()), user.name, user.email, True)] + [
        (str(ObjectId()), str(ObjectId()), p["display_name"], p.get("email"), False)
        for p in participants
    ]
    return _plan(str(ObjectId()), sub, people, _context(user))


def remind(plan_id: str, payment_id: str) -> dict:
    user = demo_user()
    if plan_id != SHARED_PLAN_ID:
        raise not_found()
    plan = _netflix_plan(user, _context(user))
    person = next((p for p in plan["participants"] if p["payment_id"] == payment_id), None)
    if person is None:
        raise not_found()
    if person["status"] == "paid":
        raise ApiError(409, "already_paid", "This share is already paid.")
    share = person["share"]
    now = timezone.now()
    return {
        "payment_id": payment_id,
        "channel": "email" if person["email"] else "share_sheet",
        "message": (
            f"Hi {person['display_name']}, your share of {plan['name']} for "
            f"{TODAY:%B %Y} is {share['amount']} {share['currency']}."
        ),
        "last_reminded_at": now,
        "next_reminder_available_at": now + REMINDER_INTERVAL,
    }


# Extractions (04 §6a, 11 §2.2-2.4) ---------------------------------------------

_EXTRACTION_IDS = (
    "6a0c00000000000000000001",
    "6a0c00000000000000000002",
    "6a0c00000000000000000003",
)


def _day(day: date) -> str:
    return f"{day:%b} {day.day}, {day.year}"


def _fields(**values) -> dict:
    keys = (
        "service_name",
        "plan_name",
        "price",
        "currency",
        "billing_cycle",
        "custom_cycle_count",
        "custom_cycle_unit",
        "subscription_type",
        "trial_ends_on",
        "start_date",
        "category",
    )
    return {key: values.get(key) for key in keys}


def _confidence(**values) -> dict:
    keys = (
        "service_name",
        "plan_name",
        "price",
        "currency",
        "billing_cycle",
        "subscription_type",
        "trial_ends_on",
        "start_date",
        "category",
    )
    return {key: values.get(key) for key in keys}


def _extractions(user: User) -> list[dict]:
    created = operations.at_start_of(TODAY)
    expires = created + timedelta(hours=24)
    disney_ends = TODAY + timedelta(days=18)
    hulu = Subscription.objects.filter(owner=user, name="Hulu").first()
    hulu_ends = hulu.trial_ends_on if hulu else TODAY + timedelta(days=2)
    return [
        {
            "id": _EXTRACTION_IDS[0],
            "source": {
                "sender": "Figma <billing@figma.com>",
                "subject": "Your Figma Professional receipt",
                "snippet": (
                    f"Thanks for subscribing to Figma Professional. We charged $15.00 on "
                    f"{_day(TODAY)}. Your plan renews monthly."
                ),
            },
            "fields": _fields(
                service_name="Figma",
                plan_name="Professional",
                price="15.00",
                currency="USD",
                billing_cycle="monthly",
                subscription_type="paid",
                start_date=TODAY,
                category="productivity",
            ),
            "confidence": _confidence(
                service_name=0.98,
                plan_name=0.93,
                price=0.99,
                currency=0.97,
                billing_cycle=0.95,
                subscription_type=0.96,
                start_date=0.92,
                category=0.81,
            ),
            "flagged": [],
            "duplicate_of": None,
            "created_at": created,
            "expires_at": expires,
        },
        {
            # The end date is worked out from "in 18 days", not quoted, so it
            # is under the 60% band and must be confirmed (11 §2.4).
            "id": _EXTRACTION_IDS[1],
            "source": {
                "sender": "Disney+ <disneyplus@mail.disneyplus.com>",
                "subject": "Your free trial has started",
                "snippet": (
                    "Welcome to Disney+! Your free trial ends in 18 days. After that, you "
                    "will be charged $13.99 per month."
                ),
            },
            "fields": _fields(
                service_name="Disney+",
                price="13.99",
                currency="USD",
                billing_cycle="monthly",
                subscription_type="trial",
                trial_ends_on=disney_ends,
                start_date=disney_ends,
                category="entertainment",
            ),
            "confidence": _confidence(
                service_name=0.97,
                price=0.98,
                currency=0.96,
                billing_cycle=0.94,
                subscription_type=0.95,
                trial_ends_on=0.54,
                start_date=0.54,
                category=0.78,
            ),
            "flagged": ["trial_ends_on", "start_date"],
            "duplicate_of": None,
            "created_at": created,
            "expires_at": expires,
        },
        {
            # 11 §2.7's Hulu wording, dated from the seed; Alex already tracks it.
            "id": _EXTRACTION_IDS[2],
            "source": {
                "sender": "Hulu <hulu@hulumail.com>",
                "subject": "Your Hulu free trial",
                "snippet": (
                    f"Your free trial ends on {_day(hulu_ends)}. After that, you will be "
                    "charged $17.99 per month."
                ),
            },
            "fields": _fields(
                service_name="Hulu",
                price="17.99",
                currency="USD",
                billing_cycle="monthly",
                subscription_type="trial",
                trial_ends_on=hulu_ends,
                start_date=hulu_ends,
                category="entertainment",
            ),
            "confidence": _confidence(
                service_name=0.99,
                price=0.98,
                currency=0.96,
                billing_cycle=0.95,
                subscription_type=0.97,
                trial_ends_on=0.93,
                start_date=0.9,
                category=0.8,
            ),
            "flagged": [],
            "duplicate_of": str(hulu.pk) if hulu else None,
            "created_at": created,
            "expires_at": expires,
        },
    ]


def scan() -> dict:
    return {"status": "scanning"}


def pending_extractions() -> dict:
    return {"scanning": False, "results": _extractions(demo_user())}


def confirm_extraction(extraction_id: str, fields: dict) -> dict:
    if extraction_id not in _EXTRACTION_IDS:
        raise not_found()
    return _preview_create(fields)


def discard_extraction(extraction_id: str) -> None:
    if extraction_id not in _EXTRACTION_IDS:
        raise not_found()


# Gmail (04 §6a, 11 §2.1) -------------------------------------------------------


def connect_gmail(code: str, redirect_uri: str, code_verifier: str | None = None) -> dict:
    user = demo_user()
    return {"provider": "gmail", "email": user.email, "connected_at": operations.at_start_of(TODAY)}


def disconnect_gmail() -> None:
    return None
