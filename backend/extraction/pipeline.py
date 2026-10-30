"""From an email and the model's reading of it, to what the review screen shows.

Handoff 11 §2.2 and §2.8. Pure: no database, no HTTP, no clock. The caller
passes in the email, the model's output, and the few facts about the user it
needs, so the eval (§2.7) runs the very same code on fixtures that a scan
runs on a real inbox.

Two rules carry the design.

**Grounding.** Every value the model returns is looked for in the email
itself. One that is not there is blanked and flagged, never shown as a guess.
The model's job is to read; it never gets the last word on what the email
says.

**Confidence is computed, not asked for.** Models are poorly calibrated
about their own certainty, and the screen shows these numbers, so they come
from checks the code can explain: was the value found verbatim, was it
unambiguous, is it plausible. There are a handful of levels rather than a
continuum, so the calibration table in the eval has enough cases at each
level to say whether the level means what it claims.
"""

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from subscriptions.fx import SUPPORTED_CURRENCIES

# The contract's ExtractedFields, in its order.
FIELDS = (
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
# The contract's ExtractionConfidence: the custom-cycle pair rides on billing_cycle.
SCORED = tuple(f for f in FIELDS if not f.startswith("custom_cycle_"))
# Without these a subscription cannot be created, so a blank one is flagged.
REQUIRED = ("service_name", "price", "currency", "billing_cycle", "subscription_type", "start_date")

CYCLES = ("weekly", "monthly", "quarterly", "yearly", "custom")
UNITS = ("days", "weeks", "months", "years")
TYPES = ("paid", "trial")
CATEGORIES = (
    "entertainment",
    "productivity",
    "ai-tools",
    "cloud-storage",
    "news-media",
    "health-wellness",
    "other",
)

# Bands from the two review frames (11 §2.2).
GREEN = 0.90
AMBER = 0.60

# The levels. Each is a claim the eval's calibration table tests.
VERBATIM = 0.98  # found in the email exactly, and nothing else competes with it
CATALOG = 0.95  # category, from SubTrak's own service catalog
AMBIGUOUS = 0.75  # found, but the email also supports another reading
INFERRED = 0.70  # category the model chose for a service the catalog lacks
DERIVED = 0.55  # worked out from the email ("in 18 days"), never quoted in it
DEFAULTED = 0.40  # not in the email at all: filled from the user's own default
IMPLAUSIBLE = 0.30  # found, but it cannot be right (a date years away)

# Labels the eval reports, one per field.
FOUND, AMBIGUOUS_FOUND, DERIVED_FROM, DEFAULT, MISSING, INVALID, CATALOGUED, CHOSEN = (
    "verbatim",
    "ambiguous",
    "derived",
    "defaulted",
    "missing",
    "invalid",
    "catalog",
    "inferred",
)

# How far from the email's date a date may sit and still be plausible.
PLAUSIBLE_DAYS = 400
MAX_PRICE = Decimal("10000")


# Text -------------------------------------------------------------------------------------


def normalise(text: str) -> str:
    """Case, width, spacing and punctuation folded, so "Oct 19" finds "oct 19"."""
    text = unicodedata.normalize("NFKC", text)
    text = text.translate(str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-"}))
    return " ".join(text.casefold().split())


@dataclass(frozen=True)
class Source:
    """One email, as the pipeline sees it. Held in memory only."""

    sender: str
    subject: str
    text: str
    received_on: date

    @property
    def haystack(self) -> str:
        """Everything the user can see: a name in the From line counts as found."""
        return normalise(f"{self.sender}\n{self.subject}\n{self.text}")


# Screening: rejected before the model is asked (11 §2.8) ----------------------------------

# Common short words of English, and of the languages a SubTrak user's
# receipts are likeliest to arrive in otherwise. Words both sides share
# ("a", "die", "me", "no") are left out of the foreign list.
#
# Rejection needs *positive* evidence of another language. An earlier version
# rejected anything thin on English filler, and the eval caught it throwing
# away a terse English receipt ("Amount paid $20.00. Date paid ...").
_ENGLISH = frozenset(
    "the an and or of to in on for is are was be been your you we our it this that with "
    "will at by from as has have after before per month year if not".split()
)
_FOREIGN = frozenset(
    # Spanish
    "el la los las del por para con una tu su sus se al es está gracias pago mes cuenta "
    "puedes desde momento cualquier "
    # French
    "le les des du et est une pour pas qui dans sur aux avec ces vous votre vos nous merci "
    # German
    "der das und ist nicht ein eine mit für auf den dem sie ihr ihre wir zu von im danke "
    # Portuguese and Italian
    "os da em um uma não seu sua obrigado il di che non sono grazie".split()
)
_SUBSCRIPTION_SIGNAL = re.compile(
    r"subscri|renew|membership|\btrial\b|\bplan\b|per (month|year|week)|monthly|annual|yearly"
    r"|/mo\b|/yr\b|billed|recurring"
)

NOT_ENGLISH = "not_english"
NOT_A_SUBSCRIPTION = "not_a_subscription"


def screen(source: Source) -> str | None:
    """Why this email should not be sent to the model at all, or None.

    Cheap and conservative: it only has to catch what is plainly out of
    scope, and anything it lets through still meets the model's own check.
    A rejected email costs nothing and does not count against the cap.
    """
    words = re.findall(r"[^\W\d_']+", normalise(source.text))[:300]
    foreign = sum(w in _FOREIGN for w in words)
    if foreign >= 3 and foreign > sum(w in _ENGLISH for w in words):
        return NOT_ENGLISH
    if not _SUBSCRIPTION_SIGNAL.search(normalise(f"{source.subject} {source.text}")):
        return NOT_A_SUBSCRIPTION
    return None


# Money ------------------------------------------------------------------------------------

# Symbol or code, as written, to the currency it means. "$" alone is read as
# US dollars unless the email mentions another dollar (see _dollar_is_clear).
_MARKERS = {
    "us$": "USD",
    "ca$": "CAD",
    "c$": "CAD",
    "a$": "AUD",
    "au$": "AUD",
    "r$": "BRL",
    "$": "USD",
    "€": "EUR",
    "£": "GBP",
    "¥": "JPY",
    "₹": "INR",
    **{code.casefold(): code for code in SUPPORTED_CURRENCIES},
}
_MARKER = "|".join(re.escape(m) for m in sorted(_MARKERS, key=len, reverse=True))
_AMOUNT = r"\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?"
_MONEY = re.compile(
    rf"(?:(?P<pre>{_MARKER})\s?)?(?P<num>{_AMOUNT})(?:\s?(?P<post>{_MARKER}))?(?![\d])"
)
_OTHER_DOLLARS = re.compile(
    r"\b(cad|aud|canada|canadian|australia|australian)\b|\.ca\b|\.com\.au\b"
)


@dataclass(frozen=True)
class Money:
    amount: Decimal
    marker: str | None
    start: int
    end: int


def _amount(raw: str) -> Decimal | None:
    if "," in raw and "." not in raw and re.fullmatch(r"\d+,\d{2}", raw):
        raw = raw.replace(",", ".")  # 12,99 written the European way
    try:
        return Decimal(raw.replace(",", ""))
    except InvalidOperation:  # pragma: no cover - the pattern only admits digits
        return None


def amounts(text: str) -> list[Money]:
    """Every amount of money in `text` (already normalised).

    An amount counts if it carries a currency mark, or if it is written with
    two decimal places: "9.99 per month" is money, "18 days" and "2026" are not.
    """
    found = []
    for match in _MONEY.finditer(text):
        marker = match["pre"] or match["post"]
        num = match["num"]
        if not marker and not re.search(r"[.,]\d{2}$", num):
            continue
        value = _amount(num)
        if value is not None:
            found.append(Money(value, marker, match.start(), match.end()))
    return found


def _dollar_is_clear(text: str) -> bool:
    return not _OTHER_DOLLARS.search(text)


# Cycles -----------------------------------------------------------------------------------

_CYCLE_PHRASES = {
    "monthly": re.compile(
        r"\b(?:per|a|each|every|/)\s?(?:month|mo)\b|\bmonthly\b|/\s?mo(?:nth)?\b"
    ),
    "yearly": re.compile(
        r"\b(?:per|a|each|every|/)\s?(?:year|yr|annum)\b|\b(?:annually|yearly|annual)\b|/\s?(?:yr|year)\b"
    ),
    "weekly": re.compile(r"\b(?:per|a|each|every|/)\s?week\b|\bweekly\b|/\s?wk\b"),
    "quarterly": re.compile(r"\bquarterly\b|\bevery (?:3|three) months\b|\bper quarter\b"),
}
_NUMBERS = {"two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "eight": 8, "twelve": 12}
_CUSTOM = re.compile(r"\bevery (\d+|two|three|four|five|six|eight|twelve) (day|week|month|year)s\b")
# 11 §2.8's "$9/mo, billed annually": quoted monthly, charged yearly.
_BILLED_YEARLY = re.compile(r"\bbilled (?:annually|yearly|once a year)\b|\bper year, billed\b")


def cycles(text: str) -> set[str]:
    found = {name for name, pattern in _CYCLE_PHRASES.items() if pattern.search(text)}
    for count, unit in _CUSTOM.findall(text):
        n = int(count) if count.isdigit() else _NUMBERS[count]
        if (n, unit) == (3, "month"):
            continue  # that is quarterly, found above
        found.add("custom")
    return found


def custom_cycles(text: str) -> set[tuple[int, str]]:
    return {
        (int(c) if c.isdigit() else _NUMBERS[c], f"{u}s")
        for c, u in _CUSTOM.findall(text)
        if not (c in ("3", "three") and u == "month")
    }


def _near(text: str, money: Money, pattern: re.Pattern, reach: int = 24) -> bool:
    """Whether `pattern` follows this amount before the next amount does.

    The window stops at the next figure. Without that stop, "from $15.49 to
    $17.99 per month" read as if $15.49 were the monthly price, and the eval
    caught a wrong price being shown green.
    """
    window = text[money.end : money.end + reach]
    window = re.split(r"[\d$€£¥₹]", window, maxsplit=1)[0]
    return bool(pattern.search(window))


_ANY_CYCLE = re.compile("|".join(p.pattern for p in _CYCLE_PHRASES.values()))


# Dates ------------------------------------------------------------------------------------

_MONTHS = {
    m: i
    for i, names in enumerate(
        [
            ("jan", "january"),
            ("feb", "february"),
            ("mar", "march"),
            ("apr", "april"),
            ("may",),
            ("jun", "june"),
            ("jul", "july"),
            ("aug", "august"),
            ("sep", "sept", "september"),
            ("oct", "october"),
            ("nov", "november"),
            ("dec", "december"),
        ],
        start=1,
    )
    for m in names
}
_MONTH = "|".join(sorted(_MONTHS, key=len, reverse=True))
_MDY = re.compile(rf"\b({_MONTH})\.? (\d{{1,2}})(?:st|nd|rd|th)?(?:,? (\d{{4}}))?\b")
_DMY = re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)? ({_MONTH})\.?,? (\d{{4}})\b")
_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
_SLASH = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")
_IN_DAYS = re.compile(r"\bin (\d{1,3}) days?\b|\b(\d{1,3})[- ]day (?:free )?trial\b")


def _make(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


@dataclass
class Dates:
    """The dates an email mentions, sorted by how sure we can be of each."""

    clear: set[date] = field(default_factory=set)
    ambiguous: set[date] = field(default_factory=set)
    derived: set[date] = field(default_factory=set)


def dates(text: str, received_on: date) -> Dates:
    found = Dates()
    for month, day, year in _MDY.findall(text):
        if year:
            found.clear.add(_make(int(year), _MONTHS[month], int(day)))
        else:
            # "Oct 19" with no year: the next one on or after the email.
            guess = _make(received_on.year, _MONTHS[month], int(day))
            if guess and guess < received_on - timedelta(days=31):
                guess = _make(received_on.year + 1, _MONTHS[month], int(day))
            found.ambiguous.add(guess)
    for day, month, year in _DMY.findall(text):
        found.clear.add(_make(int(year), _MONTHS[month], int(day)))
    for year, month, day in _ISO.findall(text):
        found.clear.add(_make(int(year), int(month), int(day)))
    for first, second, year in _SLASH.findall(text):
        a, b, y = int(first), int(second), int(year)
        us, eu = _make(y, a, b), _make(y, b, a)
        if us and eu and us != eu:
            found.ambiguous.update({us, eu})  # 10/11/2026: October or November?
        else:
            found.clear.add(us or eu)
    for ahead, trial_days in _IN_DAYS.findall(text):
        found.derived.add(received_on + timedelta(days=int(ahead or trial_days)))
    for bucket in (found.clear, found.ambiguous, found.derived):
        bucket.discard(None)
    found.ambiguous -= found.clear
    return found


# Types ------------------------------------------------------------------------------------

_TRIAL = re.compile(r"\bfree trial\b|\btrial (?:ends|period|expires|will end|starts|has started)\b")
# Past tense only: every trial email says what "will be charged".
_PAID = re.compile(
    r"\breceipt\b|\binvoice\b|\bpayment (?:received|confirmation|successful)\b|\bwe charged\b"
    r"|\byou were charged\b|\bhas been charged\b|\byou've been charged\b"
    r"|\bthanks for your payment\b"
    r"|\bhas renewed\b|\bwas renewed\b|\bwill renew\b|\brenews on\b"
)


# The result -------------------------------------------------------------------------------


@dataclass
class Candidate:
    """What the review screen shows for one email (the contract's PendingExtraction)."""

    fields: dict
    confidence: dict
    flagged: list[str]
    duplicate_of: str | None = None
    # Per field, how its confidence was reached. For the eval and the logs;
    # never sent to the client.
    checks: dict = field(default_factory=dict)


def _blank_fields() -> dict:
    return dict.fromkeys(FIELDS)


def blank(source: Source) -> Candidate:
    """The fallback when the model is down or its output unusable: an empty
    Add form, so the user can still type the details in (11 §2.8)."""
    return Candidate(
        fields=_blank_fields(),
        confidence=dict.fromkeys(SCORED),
        flagged=list(REQUIRED),
        checks=dict.fromkeys(SCORED, MISSING),
    )


def service_key(name: str) -> str:
    """A name reduced for comparison: "Disney+" and "Disney Plus" both become "disneyplus"."""
    return re.sub(r"[^a-z0-9]", "", normalise(name).replace("+", " plus"))


def find_duplicate(name: str | None, existing: list[tuple[str, str]]) -> str | None:
    """The id of a subscription the user already tracks under this name, if any.

    Equal names, or one a prefix of the other ("YouTube" and "YouTube
    Premium"). A miss means a second row the user can still delete; a false
    match only offers "Update the existing one", which the user can decline.
    """
    if not name:
        return None
    key = service_key(name)
    for subscription_id, other in existing:
        theirs = service_key(other)
        if key and theirs and (key == theirs or key.startswith(theirs) or theirs.startswith(key)):
            return subscription_id
    return None


class _Reader:
    """Scores one model output against one email."""

    def __init__(self, source: Source, output: dict, default_currency: str, catalog: dict):
        self.source = source
        self.output = output
        self.text = source.haystack
        self.default_currency = default_currency
        self.catalog = catalog
        self.fields = _blank_fields()
        self.confidence = dict.fromkeys(SCORED)
        self.checks = {}
        self.money = amounts(self.text)
        self.dates = dates(self.text, source.received_on)
        self.price_match: Money | None = None

    def keep(self, name: str, value, level: float, label: str) -> None:
        self.fields[name] = value
        self.confidence[name] = level
        self.checks[name] = label

    def drop(self, name: str, label: str) -> None:
        self.checks[name] = label

    # Each field -------------------------------------------------------------------

    def service_name(self) -> None:
        name = self.output.get("service_name")
        if not name:
            return self.drop("service_name", MISSING)
        if normalise(name) in self.text:
            return self.keep("service_name", name.strip(), VERBATIM, FOUND)
        self.drop("service_name", MISSING)

    def plan_name(self) -> None:
        plan = self.output.get("plan_name")
        if not plan:
            return
        if normalise(plan) in self.text:
            return self.keep("plan_name", plan.strip(), VERBATIM, FOUND)
        self.drop("plan_name", MISSING)

    def billing_cycle(self) -> None:
        cycle = self.output.get("billing_cycle")
        if cycle not in CYCLES:
            return self.drop("billing_cycle", INVALID if cycle else MISSING)
        mentioned = cycles(self.text)
        if cycle == "custom":
            pair = (self.output.get("custom_cycle_count"), self.output.get("custom_cycle_unit"))
            if pair in custom_cycles(self.text):
                self.fields["custom_cycle_count"], self.fields["custom_cycle_unit"] = pair
                level = VERBATIM if mentioned == {"custom"} else AMBIGUOUS
                return self.keep("billing_cycle", cycle, level, FOUND)
            return self.drop("billing_cycle", MISSING)
        if cycle not in mentioned:
            return self.drop("billing_cycle", MISSING)
        if cycle == "yearly" and "monthly" in mentioned and _BILLED_YEARLY.search(self.text):
            # "$9/mo, billed annually": yearly is right, but it is read, not quoted.
            return self.keep("billing_cycle", cycle, DERIVED, DERIVED_FROM)
        level = VERBATIM if mentioned == {cycle} else AMBIGUOUS
        self.keep("billing_cycle", cycle, level, FOUND if level == VERBATIM else AMBIGUOUS_FOUND)

    def price(self) -> None:
        raw = self.output.get("price")
        try:
            value = Decimal(str(raw)) if raw is not None else None
        except InvalidOperation:
            return self.drop("price", INVALID)
        if value is None:
            return self.drop("price", MISSING)
        if not (0 < value <= MAX_PRICE):
            return self.keep("price", f"{value:.2f}", IMPLAUSIBLE, INVALID)
        matches = [m for m in self.money if m.amount == value]
        if matches:
            match = next((m for m in matches if _near(self.text, m, _ANY_CYCLE)), matches[0])
            self.price_match = match
            competing = {m.amount for m in self.money if m.amount not in (0, value)}
            stated = _near(self.text, match, _ANY_CYCLE)
            if competing and not stated:
                return self.keep("price", f"{value:.2f}", AMBIGUOUS, AMBIGUOUS_FOUND)
            return self.keep("price", f"{value:.2f}", VERBATIM, FOUND)
        # "$9/mo, billed annually" -> 108.00 a year: right, but not in the email.
        monthly = (value / 12).quantize(Decimal("0.01"))
        quoted = [m for m in self.money if m.amount == monthly]
        if quoted and self.fields["billing_cycle"] == "yearly" and _BILLED_YEARLY.search(self.text):
            self.price_match = quoted[0]
            return self.keep("price", f"{value:.2f}", DERIVED, DERIVED_FROM)
        self.drop("price", MISSING)

    def currency(self) -> None:
        if self.price_match is not None and self.price_match.marker is None:
            # 11 §2.8: price present, no currency -> the user's own currency, flagged.
            return self.keep("currency", self.default_currency, DEFAULTED, DEFAULT)
        code = self.output.get("currency")
        if code not in SUPPORTED_CURRENCIES:
            return self.drop("currency", INVALID if code else MISSING)
        if self.price_match is not None:
            meant = _MARKERS.get(self.price_match.marker)
            if meant != code:
                return self.drop("currency", MISSING)
            if self.price_match.marker == "$" and not _dollar_is_clear(self.text):
                return self.keep("currency", code, AMBIGUOUS, AMBIGUOUS_FOUND)
            return self.keep("currency", code, VERBATIM, FOUND)
        # No price to anchor to: keep it only if the email shows that currency somewhere.
        if any(_MARKERS.get(m.marker) == code for m in self.money if m.marker):
            return self.keep("currency", code, AMBIGUOUS, AMBIGUOUS_FOUND)
        self.drop("currency", MISSING)

    def subscription_type(self) -> None:
        kind = self.output.get("subscription_type")
        if kind not in TYPES:
            return self.drop("subscription_type", INVALID if kind else MISSING)
        trial, paid = bool(_TRIAL.search(self.text)), bool(_PAID.search(self.text))
        ours = trial if kind == "trial" else paid
        if not ours:
            return self.drop("subscription_type", MISSING)
        level = AMBIGUOUS if trial and paid else VERBATIM
        self.keep("subscription_type", kind, level, FOUND if level == VERBATIM else AMBIGUOUS_FOUND)

    def _date(self, name: str, *, not_before: date) -> None:
        raw = self.output.get(name)
        if not raw:
            return self.drop(name, MISSING)
        try:
            value = date.fromisoformat(raw)
        except (TypeError, ValueError):
            return self.drop(name, INVALID)
        received = self.source.received_on
        if value in self.dates.clear:
            level, label = VERBATIM, FOUND
        elif value in self.dates.ambiguous:
            level, label = AMBIGUOUS, AMBIGUOUS_FOUND
        elif value in self.dates.derived:
            level, label = DERIVED, DERIVED_FROM
        elif name == "start_date" and value == received and self.fields["subscription_type"]:
            # A receipt with no date in it was sent on the day it charged.
            level, label = DERIVED, DERIVED_FROM
        else:
            return self.drop(name, MISSING)
        if not (not_before <= value <= received + timedelta(days=PLAUSIBLE_DAYS)):
            level, label = IMPLAUSIBLE, INVALID
        self.keep(name, value.isoformat(), level, label)

    def trial_ends_on(self) -> None:
        if self.fields["subscription_type"] != "trial":
            return
        self._date("trial_ends_on", not_before=self.source.received_on - timedelta(days=1))

    def start_date(self) -> None:
        ends = self.fields["trial_ends_on"]
        if self.fields["subscription_type"] == "trial" and ends is not None:
            # A trial's first charge is the day it ends, which is how the seed
            # (04 §4) stores one. A rule, not the model's guess.
            confidence, label = self.confidence["trial_ends_on"], self.checks["trial_ends_on"]
            return self.keep("start_date", ends, confidence, label)
        received = self.source.received_on
        self._date("start_date", not_before=received - timedelta(days=PLAUSIBLE_DAYS))

    def category(self) -> None:
        name = self.fields["service_name"]
        known = self.catalog.get(service_key(name)) if name else None
        if known:
            return self.keep("category", known, CATALOG, CATALOGUED)
        slug = self.output.get("category")
        if slug in CATEGORIES:
            return self.keep("category", slug, INFERRED, CHOSEN)
        self.drop("category", INVALID if slug else MISSING)

    def read(self) -> None:
        # Order matters: the price needs the cycle, the currency needs the
        # price, and the dates need the type.
        self.service_name()
        self.plan_name()
        self.billing_cycle()
        self.price()
        self.currency()
        self.subscription_type()
        self.trial_ends_on()
        self.start_date()
        self.category()

    def flagged(self) -> list[str]:
        out = []
        for name in SCORED:
            level = self.confidence[name]
            blank_required = self.fields[name] is None and (
                name in REQUIRED
                or (name == "trial_ends_on" and self.fields["subscription_type"] == "trial")
            )
            # The grounding rule: a value the model gave that the email does
            # not support is blanked *and* flagged, so the user has to look.
            ungrounded = self.fields[name] is None and self.checks.get(name) in (MISSING, INVALID)
            ungrounded = ungrounded and self.output.get(name) not in (None, "")
            if (level is not None and level < AMBER) or blank_required or ungrounded:
                out.append(name)
        return out


def extract(
    source: Source,
    output: dict,
    *,
    default_currency: str = "USD",
    catalog: dict[str, str] | None = None,
    existing: list[tuple[str, str]] | None = None,
) -> Candidate:
    """Score the model's `output` for `source` into what the review screen shows.

    `catalog` maps `service_key(name)` to a category slug; `existing` is the
    user's (id, name) pairs, for the duplicate check.
    """
    reader = _Reader(source, output, default_currency, catalog or {})
    reader.read()
    return Candidate(
        fields=reader.fields,
        confidence=reader.confidence,
        flagged=reader.flagged(),
        duplicate_of=find_duplicate(reader.fields["service_name"], existing or []),
        checks=reader.checks,
    )


def band(confidence: float | None) -> str | None:
    """green / amber / flagged, as the review screen colours a chip."""
    if confidence is None:
        return None
    if confidence >= GREEN:
        return "green"
    return "amber" if confidence >= AMBER else "flagged"
