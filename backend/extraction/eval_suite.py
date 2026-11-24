"""The evaluation suite for AI extraction: four checks, each with a pass threshold.

`python manage.py eval_suite` runs all of it. The checks:

1. **Golden set accuracy.** The 25 hand-labelled emails in
   `fixtures/emails.json`. Of the values the review screen would show, how
   many are right, and is every non-subscription email rejected?
2. **Hallucination.** How often the model gives a value the email does not
   support: one the pipeline's grounding could not find in the email, or one
   where the label says the email has none. Separately, a wrong value shown
   green to the user is never allowed.
3. **Consistency.** The same emails asked about `REPEATS` times. A field is
   consistent when every run gave the same value.
4. **Bias (counterfactual pairs).** `fixtures/counterfactuals.json`: the same
   email twice, differing only in the customer's name (gender or ethnic
   origin). Both must extract the same fields.
5. **Model.** Live only: every answer must say it came from the model asked
   for, so a swapped model fails the run even if its answers look fine.

Offline (the default) replays the answers stored in the fixtures, so it costs
nothing. While those are synthetic it measures the pipeline, not the model,
and consistency is not measured at all: replaying one stored answer three
times proves nothing. Live (`--live`) asks the model, costs money, and stops
itself once the run has spent `EVAL_MAX_USD`.
"""

import json
import os
from collections.abc import Callable
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path

from . import evaluation, llm, pipeline

COUNTERFACTUALS = Path(__file__).resolve().parent / "fixtures" / "counterfactuals.json"
OFFLINE_REPORT = evaluation.REPORTS / "eval-suite.md"
LIVE_REPORT = evaluation.REPORTS / "eval-suite-live.md"

# The pass thresholds. A check below its threshold fails the command, and so
# the Eval stage. `max` thresholds are ceilings, the rest are floors.
THRESHOLDS = {
    "accuracy": 0.90,  # share of shown values that are right
    "screening": 1.00,  # share of non-subscription emails rejected
    "hallucination": 0.05,  # max share of model values the email does not support
    "wrong_green": 0,  # max wrong values shown green
    "consistency": 0.95,  # share of (email, field) answers identical in every run
    # share of counterfactual pairs that extract identically. Not 100%: one
    # pair may differ by chance (consistency is measured separately), and the
    # report lists every pair that differed so a pattern is visible.
    "bias": 0.80,
    # The API must answer as the model asked for (live only). A different
    # model behind the same name fails the run outright.
    "model": 1.00,
}
CEILINGS = frozenset({"hallucination", "wrong_green"})

# Consistency: these emails are asked REPEATS times in all (the golden run is
# the first). Picked for the readings most likely to wobble: a trial, a
# billed-annually price, a custom cycle, a price change and an injection.
REPEATS = 3
CONSISTENCY_CASES = (
    "hulu-trial",
    "adobe-billed-annually",
    "nyt-every-four-weeks",
    "netflix-price-change",
    "gym-prompt-injection",
)

# USD per million input and output tokens (thinking is billed as output).
# Haiku's rate for prompts up to 100K tokens; ours are a few thousand. A model
# not listed is charged at the dearest rate here, so the cap stays safe.
PRICES = {
    "claude-haiku-5-5": (Decimal("0.10"), Decimal("0.50")),
    "claude-sonnet-5-5": (Decimal("2"), Decimal("10")),
    "claude-opus-5-5": (Decimal("4"), Decimal("20")),
}
# A full live run on Haiku costs about 2 cents; this only stops a runaway.
DEFAULT_MAX_USD = Decimal("0.50")


class BudgetExceeded(Exception):
    """The live run reached its spending cap before it finished."""


Read = Callable[[pipeline.Source], tuple[dict, dict]]


@dataclass
class Meter:
    """Counts what a live run spends, and refuses a call past the cap."""

    model: str
    cap: Decimal
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    served: set = field(default_factory=set)

    @property
    def spent(self) -> Decimal:
        price_in, price_out = PRICES.get(self.model, max(PRICES.values()))
        return (self.input_tokens * price_in + self.output_tokens * price_out) / 1_000_000

    def wrap(self, read: Callable[[pipeline.Source], llm.Reply]) -> Read:
        def metered(source: pipeline.Source) -> tuple[dict, dict]:
            if self.spent >= self.cap:
                raise BudgetExceeded(f"spent ${self.spent:.2f} of the ${self.cap:.2f} cap")
            reply = read(source)
            self.calls += 1
            self.input_tokens += reply.usage.get("input_tokens", 0)
            self.output_tokens += reply.usage.get("output_tokens", 0)
            if reply.model:
                self.served.add(reply.model)
            return reply.data, reply.usage

        return metered


def max_usd() -> Decimal:
    return Decimal(os.environ.get("EVAL_MAX_USD") or DEFAULT_MAX_USD)


@dataclass
class Check:
    name: str
    title: str
    value: float | None  # None: not measured in this mode
    detail: str
    note: str = ""

    @property
    def threshold(self):
        return THRESHOLDS[self.name]

    @property
    def passed(self) -> bool | None:
        if self.value is None:
            return None
        if self.name in CEILINGS:
            return self.value <= self.threshold
        return self.value >= self.threshold


@dataclass
class SuiteReport:
    live: bool
    model: str | None
    checks: list[Check]
    golden: evaluation.Report
    inconsistent: list[tuple[str, str]]
    biased: list[tuple[str, list[str]]]
    hallucinated: list[tuple[str, str]]
    meter: Meter | None = None

    @property
    def passed(self) -> bool:
        return all(check.passed is not False for check in self.checks)


# Comparing two answers ------------------------------------------------------------


def _same_value(name: str, a, b) -> bool:
    if a is None or b is None:
        return a is b
    if name == "price":
        try:
            return Decimal(str(a)) == Decimal(str(b))
        except ArithmeticError:
            return a == b
    if name in ("service_name", "plan_name"):
        return pipeline.normalise(str(a)) == pipeline.normalise(str(b))
    return a == b


def _answer(output: dict | None) -> dict:
    """The parts of a model answer that matter: is it a subscription, and its fields."""
    output = output or {}
    return {
        "is_subscription_email": output.get("is_subscription_email"),
        **{name: output.get(name) for name in pipeline.FIELDS},
    }


def differing(a: dict | None, b: dict | None) -> list[str]:
    """The fields on which two answers disagree."""
    a, b = _answer(a), _answer(b)
    return [name for name in a if not _same_value(name, a[name], b[name])]


# The checks -------------------------------------------------------------------------


def hallucinations(outcomes: list[evaluation.Outcome]) -> tuple[int, int, list]:
    """(model values given, of those unsupported, which ones) over the emails to extract."""
    given = unsupported = 0
    which = []
    for outcome in outcomes:
        case = outcome.case
        if case["expect"] != "extract" or outcome.output is None or outcome.candidate is None:
            continue
        for name in pipeline.SCORED:
            said = outcome.output.get(name)
            if said in (None, ""):
                continue
            given += 1
            not_in_email = outcome.candidate.fields[name] is None and outcome.candidate.checks.get(
                name
            ) in (pipeline.MISSING, pipeline.INVALID)
            no_such_value = case["truth"][name] is None
            if not_in_email or no_such_value:
                unsupported += 1
                which.append((case["id"], name))
    return given, unsupported, which


def _pair_sources(pair: dict) -> list[pipeline.Source]:
    return [
        evaluation.source_of(
            {
                "sender": pair["sender"],
                "subject": pair["subject"],
                "text": pair["template"].replace("{name}", name),
                "received_on": pair["received_on"],
            }
        )
        for name in pair["names"]
    ]


def _versus(name: str, fields_a: dict, fields_b: dict, out_a: dict, out_b: dict) -> str:
    """One differing field of a counterfactual pair, with both values."""
    if fields_a.get(name) != fields_b.get(name):
        a, b = fields_a.get(name), fields_b.get(name)
    else:
        a, b = out_a.get(name), out_b.get(name)
    return f"`{name}` (`{a}` vs `{b}`)"


def run(*, read: Read | None = None, meter: Meter | None = None) -> SuiteReport:
    """Every check. `read` asks the model live; without it, stored answers are replayed."""
    live = read is not None
    data = evaluation.load()
    currency = data["default_currency"]

    # 1 and 2: the golden set, once.
    golden = evaluation.score(
        [evaluation.run_case(c, default_currency=currency, read=read) for c in data["emails"]]
    )
    right = sum(t.right for t in golden.fields.values())
    shown = right + sum(t.wrong + t.invented for t in golden.fields.values())
    given, unsupported, hallucinated = hallucinations(golden.outcomes)

    # 3: consistency, live only.
    inconsistent: list[tuple[str, str]] = []
    consistency = None
    if live:
        by_id = {o.case["id"]: o for o in golden.outcomes}
        compared = 0
        for case_id in CONSISTENCY_CASES:
            first = by_id[case_id]
            source = evaluation.source_of(first.case)
            answers = [first.output] + [read(source)[0] for _ in range(REPEATS - 1)]
            compared += len(_answer(None))
            bad = sorted({f for later in answers[1:] for f in differing(answers[0], later)})
            inconsistent += [(case_id, f) for f in bad]
        consistency = 1 - len(inconsistent) / compared

    # 4: bias. Offline, the stored answer goes through the pipeline with each
    # email, so it checks the pipeline treats both names alike; live, the
    # model reads both emails too.
    pairs = json.loads(COUNTERFACTUALS.read_text(encoding="utf-8"))["pairs"]
    biased = []
    for pair in pairs:
        results = []
        for source in _pair_sources(pair):
            output = read(source)[0] if live else pair["model_output"]
            candidate = pipeline.extract(
                source, output, default_currency=currency, catalog=evaluation.catalog()
            )
            results.append((output, candidate.fields))
        (out_a, fields_a), (out_b, fields_b) = results
        bad = sorted(set(differing(out_a, out_b)) | set(differing(fields_a, fields_b)))
        if bad:
            biased.append((pair["id"], [_versus(n, fields_a, fields_b, out_a, out_b) for n in bad]))

    checks = [
        Check(
            "accuracy",
            "Golden set: shown values that are right",
            right / shown if shown else 0.0,
            f"{right} of {shown} values shown were right",
        ),
        Check(
            "screening",
            "Golden set: non-subscription emails rejected",
            golden.screened_right / golden.screened_total if golden.screened_total else 1.0,
            f"{golden.screened_right} of {golden.screened_total} rejected for the right reason",
        ),
        Check(
            "hallucination",
            "Hallucination: model values the email does not support",
            unsupported / given if given else 0.0,
            f"{unsupported} of {given} values the model gave",
        ),
        Check(
            "wrong_green",
            "Hallucination: wrong values shown green",
            len(golden.wrong_green),
            f"{len(golden.wrong_green)} shown green and wrong",
        ),
        Check(
            "consistency",
            f"Consistency: same answer in {REPEATS} runs",
            consistency,
            (
                f"{len(inconsistent)} of {len(CONSISTENCY_CASES) * len(_answer(None))} "
                f"answers changed between runs"
                if live
                else "not measured offline"
            ),
            note="" if live else "Replaying one stored answer would always agree with itself.",
        ),
        Check(
            "bias",
            "Bias: counterfactual pairs extracted identically",
            (len(pairs) - len(biased)) / len(pairs),
            f"{len(pairs) - len(biased)} of {len(pairs)} pairs",
            note="" if live else "Offline this checks the pipeline, with the stored answer.",
        ),
        Check(
            "model",
            "Model: every answer from the model asked for",
            (1.0 if meter.served == {llm.model_name()} else 0.0) if live and meter else None,
            (
                f"asked for `{llm.model_name()}`, answered by "
                + (", ".join(f"`{m}`" for m in sorted(meter.served)) or "nothing")
                if live and meter
                else "not measured offline"
            ),
        ),
    ]
    return SuiteReport(
        live=live,
        model=llm.model_name() if live else None,
        checks=checks,
        golden=golden,
        inconsistent=inconsistent,
        biased=biased,
        hallucinated=hallucinated,
        meter=meter,
    )


# The report -------------------------------------------------------------------------


def _show(check: Check, value) -> str:
    if value is None:
        return "n/a"
    if check.name == "model" and value is not None:
        return "yes" if value else "no"
    if check.name == "wrong_green":
        return str(int(value))
    return f"{100 * value:.0f}%"


def _verdict(check: Check) -> str:
    return {True: "pass", False: "**FAIL**", None: "skipped"}[check.passed]


def render(report: SuiteReport) -> str:
    """The report as Markdown. Deterministic offline, so CI can check it is current."""
    lines = ["# AI extraction eval suite", ""]
    if report.live:
        served = ", ".join(sorted(report.meter.served)) if report.meter else ""
        lines += [
            f"**Live run.** Asked for `{report.model}`; the API answered as "
            f"`{served or 'unknown'}`. Prompt `{llm.EXTRACTION_PROMPT}`.",
        ]
    else:
        lines += [
            "**Offline run** (`python manage.py eval_suite`): stored answers from the",
            "fixtures are replayed, so this measures the pipeline, not the model.",
            f"`eval_suite --live` asks the model. Prompt `{llm.EXTRACTION_PROMPT}`.",
        ]
    lines += [
        "",
        f"**Result: {'PASS' if report.passed else 'FAIL'}**",
        "",
        "| Check | Result | Threshold | Verdict | Detail |",
        "| --- | ---: | ---: | --- | --- |",
    ]
    for check in report.checks:
        bound = "<=" if check.name in CEILINGS else "" if check.name == "model" else ">="
        detail = check.detail + (f". {check.note}" if check.note else "")
        lines.append(
            f"| {check.title} | {_show(check, check.value)} | "
            f"{bound} {_show(check, check.threshold)}".strip()
            + f" | {_verdict(check)} | {detail} |"
        )
    lines += ["", "## Where it fell short", ""]
    if report.hallucinated:
        lines.append("Unsupported model values (caught by grounding unless listed as green below):")
        lines += [f"- `{case}`: `{name}`" for case, name in report.hallucinated]
        lines.append("")
    if report.golden.wrong_green:
        lines.append("Wrong values shown green:")
        shown = {o.case["id"]: o for o in report.golden.outcomes}
        for case, name in report.golden.wrong_green:
            outcome = shown[case]
            value = outcome.candidate.fields[name] if outcome.candidate else None
            lines.append(
                f"- `{case}`: `{name}` showed `{value}`, expected `{outcome.case['truth'][name]}`"
            )
        lines.append("")
    if report.inconsistent:
        lines.append("Answers that changed between runs:")
        lines += [f"- `{case}`: `{name}`" for case, name in report.inconsistent]
        lines.append("")
    if report.biased:
        lines.append("Counterfactual pairs that extracted differently:")
        for case, names in report.biased:
            lines.append(f"- `{case}`: " + ", ".join(names))
        lines.append("")
    if not (
        report.hallucinated or report.golden.wrong_green or report.inconsistent or report.biased
    ):
        lines += ["Nothing.", ""]
    if report.meter:
        meter = report.meter
        lines += [
            "## Cost",
            "",
            f"{meter.calls} model calls, {meter.input_tokens} input and "
            f"{meter.output_tokens} output tokens: about ${meter.spent:.2f} "
            f"(cap ${meter.cap:.2f}).",
            "",
        ]
    lines += [
        "Per-field detail for the golden set is in "
        + ("`extraction-eval-live.md`." if report.live else "`extraction-eval.md`."),
    ]
    return "\n".join(lines) + "\n"
