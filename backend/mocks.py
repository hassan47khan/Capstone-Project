"""Mock answers for the one AI-epic area still without models: shared plans
(handoff 04 §6a, 11 §2.6). They belong to the 11 owner. Everything else is
real: auth, subscriptions and analytics since 04 slice 3, trials since phase
4, Gmail and extractions since phase 5.

Each view validates its request for real, calls one function in this module,
and serializes what it returns with the contract's serializers, so replacing a
function here changes nothing outside it.

How the mock answers
  - The signed-in user is always Alex Kim from the canonical dataset (04 §4),
    and "today" is always SEED_TODAY (2026-10-01). The dataset is loaded on
    first use if it is not in the database already, with no usable password:
    a request must never create an account anyone can log in to. Only
    `seed_demo` gives the demo users DEMO_PASSWORD.
  - Every figure is computed from that data through the money engine, never
    typed in. Payloads are fixed here, dated from SEED_TODAY.
"""

from datetime import timedelta
from decimal import Decimal

from bson import ObjectId
from django.utils import timezone

from accounts.models import User
from core.contract import ApiError, money, not_found, rounded
from subscriptions import operations, presenters, seed
from subscriptions.models import Subscription
from subscriptions.services import money as engine

TODAY = seed.SEED_TODAY
REMINDER_INTERVAL = timedelta(hours=24)


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
