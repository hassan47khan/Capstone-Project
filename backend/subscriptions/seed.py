"""The canonical demo dataset (handoff 04 §4, §6a), loaded by `manage.py seed_demo`.

Every date is derived from one anchor, `today` (SEED_TODAY unless overridden),
so the fixture never rots: there is no hardcoded future date anywhere. Each
subscription is given the day-of-month of its next bill and how many months
of history it has; its start_date is that many months before the next bill,
so start_date and next_bill_date always share a day-of-month (§4.1).
"""

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from django_mongodb_backend import transaction

from accounts.models import User, rules_for, settings_for

from . import operations
from .models import Category, FxRate, ServiceCatalogEntry, Subscription
from .services.cycles import Cycle, add_months

SEED_TODAY = date(2026, 10, 1)
# Every demo user logs in with this once `seed_demo` has run. Local and demo
# databases only: the seed deletes and recreates its users, so never run it
# against shared data. Only that command sets it; anything else that loads the
# dataset (the 04 §6a mocks, on a request) leaves the demo users with no usable
# password, so a fixture can never become a login.
DEMO_PASSWORD = "subtrak-demo"

# slug, display name, key into the mobile theme's category colours. Labels and
# keys match CATEGORY_LABELS and categorySlugToKey in mobile/src/theme/tokens.ts.
SYSTEM_CATEGORIES = (
    ("entertainment", "Entertainment", "entertainment"),
    ("productivity", "Productivity", "productivity"),
    ("ai-tools", "AI Tools", "aiTools"),
    ("cloud-storage", "Cloud Storage", "cloudStorage"),
    ("news-media", "News & Media", "newsMedia"),
    ("health-wellness", "Health & Wellness", "healthWellness"),
    ("other", "Other", "other"),
)

MONTHLY = Cycle("monthly")
EVERY_TWO_MONTHS = Cycle("custom", 2, "months")


@dataclass(frozen=True)
class CatalogEntry:
    name: str
    price: str
    category: str
    brand: str
    mark: str
    # Measured from Figma (handoff 04 §4.7). None means derive_tint(brand).
    tint: str | None = None
    cycle: Cycle = MONTHLY


# The six with a tint were measured from Figma. For the rest, brand is the
# service's public brand colour and the mark is a placeholder until design
# confirms it. Figma's price is not in the spec; 15.00 is a placeholder.
CATALOG = (
    CatalogEntry("Netflix", "15.49", "entertainment", "#e50914", "N", "#ffecee"),
    CatalogEntry("Spotify", "10.99", "entertainment", "#1db954", "S", "#e3f9ed"),
    CatalogEntry("Adobe CC", "54.99", "productivity", "#b38b35", "A", "#fff7cc"),
    CatalogEntry("iCloud+", "2.99", "cloud-storage", "#007aff", "iC", "#e6f0fa"),
    CatalogEntry("ChatGPT Plus", "20.00", "ai-tools", "#10a37f", "GP", "#e1f7f4"),
    CatalogEntry("YouTube Premium", "13.99", "entertainment", "#ff0000", "YT"),
    CatalogEntry("Hulu", "17.99", "entertainment", "#1ce783", "Hu"),
    CatalogEntry("Disney+", "13.99", "entertainment", "#113ccf", "D+"),
    CatalogEntry("Notion", "10.00", "productivity", "#000000", "No"),
    CatalogEntry("GitHub Pro", "4.00", "productivity", "#181717", "GH"),
    CatalogEntry(
        "Headspace", "12.99", "health-wellness", "#a259ff", "H", "#f4ecff", EVERY_TWO_MONTHS
    ),
    CatalogEntry("Dropbox", "11.99", "cloud-storage", "#0061ff", "Db"),
    CatalogEntry("Apple Music", "10.99", "entertainment", "#fa243c", "AM"),
    CatalogEntry("New York Times", "4.25", "news-media", "#000000", "NY"),
    CatalogEntry("Figma", "15.00", "productivity", "#f24e1e", "F"),
)

# Fixed demo rate, units per US dollar (§4.6).
FX_RATES = {"EUR": Decimal("0.9177")}


@dataclass(frozen=True)
class DemoSubscription:
    name: str
    price: str
    category: str
    # Day-of-month of every bill, and months between start_date and the next bill.
    bill_day: int
    months_of_history: int
    cycle: Cycle = MONTHLY
    payment_label: str = ""


@dataclass(frozen=True)
class DemoTrial:
    name: str
    price: str
    category: str
    ends_in_days: int
    length_days: int


@dataclass(frozen=True)
class DemoUser:
    email: str
    name: str
    subscriptions: tuple[DemoSubscription, ...]
    trials: tuple[DemoTrial, ...] = ()


# Netflix is not in this list: it has a scripted history (§4.4); see _seed_netflix.
ALEX = DemoUser(
    "alex.kim@example.com",
    "Alex Kim",
    (
        DemoSubscription("Spotify", "10.99", "entertainment", 4, 24),
        DemoSubscription("Adobe CC", "54.99", "productivity", 18, 14),
        DemoSubscription("iCloud+", "2.99", "cloud-storage", 1, 36),
        DemoSubscription("New York Times", "4.25", "news-media", 8, 8),
        DemoSubscription("ChatGPT Plus", "20.00", "ai-tools", 20, 18),
        DemoSubscription("YouTube Premium", "13.99", "entertainment", 15, 10),
        # §4.2 says next bill 2026-12-15, which no every-2-months schedule on
        # the 15th can produce at SEED_TODAY: the bill before it, Oct 15, is
        # also after the anchor. The schedule says Oct 15, then Dec 15.
        DemoSubscription("Headspace", "12.99", "health-wellness", 15, 12, EVERY_TWO_MONTHS),
    ),
    # §6a. They do not change Alex's $129.20.
    (
        DemoTrial("Hulu", "17.99", "entertainment", 2, 31),
        DemoTrial("Notion AI", "10.00", "productivity", 9, 30),
        DemoTrial("Duolingo Max", "13.99", "other", 21, 30),
    ),
)
JORDAN = DemoUser(
    "jordan.doe@example.com",
    "Jordan Doe",
    (
        DemoSubscription("Hulu", "17.99", "entertainment", 5, 6),
        DemoSubscription("Disney+", "13.99", "entertainment", 22, 12),
        DemoSubscription("Notion", "10.00", "productivity", 9, 4),
        DemoSubscription("GitHub Pro", "4.00", "productivity", 27, 20),
    ),
)
SAM = DemoUser(
    "sam@example.com",
    "Sam",
    (
        DemoSubscription("Apple Music", "10.99", "entertainment", 14, 9),
        DemoSubscription("Dropbox Plus", "11.99", "cloud-storage", 3, 15),
    ),
)
DEMO_USERS = (ALEX, JORDAN, SAM)

NETFLIX_BILL_DAY = 12
NETFLIX_MONTHS_OF_HISTORY = 31
NETFLIX_CATEGORY_CHANGE_AFTER_MONTHS = 15


def derive_tint(brand: str, weight: int = 12) -> str:
    """`brand` mixed `weight`% over white: a pale tile fill for the brand colour."""
    channels = (int(brand[i : i + 2], 16) for i in (1, 3, 5))
    mixed = ((255 * (100 - weight) + c * weight + 50) // 100 for c in channels)
    return "#" + "".join(f"{c:02x}" for c in mixed)


def next_bill_on_day(day: int, *, today: date) -> date:
    """The first date on or after `today` that falls on `day` of its month.

    January has every day 1-31, and add_months clamps to a short month's end.
    """
    january = date(today.year, 1, day)
    candidate = add_months(january, today.month - 1)
    return candidate if candidate >= today else add_months(january, today.month)


def ensure_system_categories() -> dict[str, Category]:
    """Create or update the seven system categories; idempotent."""
    return {
        slug: Category.objects.update_or_create(
            slug=slug,
            defaults={"display_name": name, "color_token_key": key, "is_system": True},
        )[0]
        for slug, name, key in SYSTEM_CATEGORIES
    }


def _cycle_fields(cycle: Cycle) -> dict:
    return {
        "billing_cycle": cycle.kind,
        "custom_cycle_count": cycle.count,
        "custom_cycle_unit": cycle.unit,
    }


def _seed_catalog(categories: dict[str, Category]) -> None:
    ServiceCatalogEntry.objects.all().delete()
    for entry in CATALOG:
        cycle = _cycle_fields(entry.cycle)
        ServiceCatalogEntry.objects.create(
            name=entry.name,
            default_price=Decimal(entry.price),
            category=categories[entry.category],
            brand_hex=entry.brand,
            tint_hex=entry.tint or derive_tint(entry.brand),
            mark=entry.mark,
            billing_cycle=cycle["billing_cycle"],
            custom_cycle_count=cycle["custom_cycle_count"],
            custom_cycle_unit=cycle["custom_cycle_unit"],
        )


def _seed_fx(today: date) -> None:
    for currency, rate in FX_RATES.items():
        FxRate.objects.update_or_create(
            currency=currency, defaults={"rate": rate, "as_of": operations.at_start_of(today)}
        )


def _seed_subscription(owner, sub: DemoSubscription, categories, *, today: date):
    next_bill = next_bill_on_day(sub.bill_day, today=today)
    start = add_months(next_bill, -sub.months_of_history)
    return operations.create_subscription(
        today=today,
        at=operations.at_start_of(start),
        owner=owner,
        name=sub.name,
        billing_price=Decimal(sub.price),
        category=categories[sub.category],
        start_date=start,
        payment_label=sub.payment_label,
        **_cycle_fields(sub.cycle),
    )


def _seed_trial(owner, trial: DemoTrial, categories, *, today: date):
    # The first charge is the day the trial ends, so that is the start_date.
    ends_on = today + timedelta(days=trial.ends_in_days)
    return operations.create_subscription(
        today=today,
        at=operations.at_start_of(ends_on - timedelta(days=trial.length_days)),
        owner=owner,
        name=trial.name,
        billing_price=Decimal(trial.price),
        category=categories[trial.category],
        start_date=ends_on,
        is_trial=True,
        trial_ends_on=ends_on,
        trial_length_days=trial.length_days,
    )


def _seed_netflix(owner, categories, *, today: date) -> Subscription:
    """§4.4: created at 13.99 in `other`, moved to entertainment, then 15.49 today."""
    next_bill = next_bill_on_day(NETFLIX_BILL_DAY, today=today)
    start = add_months(next_bill, -NETFLIX_MONTHS_OF_HISTORY)
    netflix = operations.create_subscription(
        today=today,
        at=operations.at_start_of(start),
        owner=owner,
        name="Netflix",
        billing_price=Decimal("13.99"),
        category=categories["other"],
        start_date=start,
        payment_label="Visa ••4242",
    )
    operations.update_subscription(
        netflix,
        today=today,
        at=operations.at_start_of(add_months(start, NETFLIX_CATEGORY_CHANGE_AFTER_MONTHS)),
        category=categories["entertainment"],
    )
    operations.update_subscription(
        netflix, today=today, at=operations.at_start_of(today), billing_price=Decimal("15.49")
    )
    return netflix


@transaction.atomic
def load_demo(*, today: date = SEED_TODAY, password: str | None = None) -> dict[str, User]:
    """Reset and load the whole demo dataset. Safe to run any number of times.

    The demo users get `password` if one is given, and an unusable password
    otherwise, so they cannot log in until `seed_demo` sets DEMO_PASSWORD.

    Removes only what it owns: the demo users (their subscriptions, history,
    settings and rules go with them), the catalog and the seeded FX rates.
    """
    User.objects.filter(email__in=[u.email for u in DEMO_USERS]).delete()
    categories = ensure_system_categories()
    _seed_catalog(categories)
    _seed_fx(today)

    users = {}
    for demo in DEMO_USERS:
        user = User.objects.create_user(email=demo.email, name=demo.name, password=password)
        user.email_verified_at = operations.at_start_of(today)
        user.save(update_fields=["email_verified_at"])
        settings_for(user)
        rules_for(user)
        if demo is ALEX:
            _seed_netflix(user, categories, today=today)
        for sub in demo.subscriptions:
            _seed_subscription(user, sub, categories, today=today)
        for trial in demo.trials:
            _seed_trial(user, trial, categories, today=today)
        users[demo.email] = user
    return users
