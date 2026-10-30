"""Scoring the pipeline against hand-labelled emails (handoff 11 §2.7).

Two kinds of run, and the report always says which one it is:

* **Offline**, the default and what CI runs. Each fixture's stored
  `model_output` is fed through the real pipeline. While those outputs are
  `synthetic` (hand-written, some deliberately wrong) this measures the
  *pipeline*: grounding, confidence, flagging and screening. It does not
  measure the model, and the report says so.
* **Live** (`eval_extraction --live`), which asks the model for real and
  measures both. Only Hassan runs it; it needs `LLM_API_KEY` and costs money.

Per field it counts what a user would see: a right value, a wrong value, a
blank (the pipeline would not vouch for it, so the user is asked), or an
invented value where the email had none. Then the calibration table: for
each confidence band, how often a value shown in that band was right.
"""

import json
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from pathlib import Path

from subscriptions.seed import CATALOG

from . import llm, pipeline

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "emails.json"
REPORTS = Path(__file__).resolve().parents[2] / "docs" / "ai"
OFFLINE_REPORT = REPORTS / "extraction-eval.md"
LIVE_REPORT = REPORTS / "extraction-eval-live.md"

# Scored as one: a custom cycle is only right if its count and unit are too.
SCORED = pipeline.SCORED
BANDS = ("green", "amber", "flagged")


def catalog() -> dict[str, str]:
    """SubTrak's service catalog (04 §4.7) as the pipeline wants it."""
    return {pipeline.service_key(entry.name): entry.category for entry in CATALOG}


def load(path: Path = FIXTURES) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def source_of(case: dict) -> pipeline.Source:
    return pipeline.Source(
        sender=case["sender"],
        subject=case["subject"],
        text=case["text"],
        received_on=date.fromisoformat(case["received_on"]),
    )


@dataclass
class Outcome:
    case: dict
    rejected: str | None = None
    candidate: pipeline.Candidate | None = None
    seconds: float | None = None
    usage: dict = field(default_factory=dict)


def run_case(
    case: dict,
    *,
    default_currency: str,
    read: Callable[[pipeline.Source], tuple[dict, dict]] | None = None,
) -> Outcome:
    """One fixture through screening, the model (stored or live) and the pipeline."""
    source = source_of(case)
    reason = pipeline.screen(source)
    if reason:
        return Outcome(case, rejected=reason)
    started = time.perf_counter()
    if read is None:
        output, usage, seconds = case["model_output"], {}, None
    else:
        try:
            output, usage = read(source)
        except (llm.LLMUnavailable, llm.LLMUnusable):
            # The scan's own fallback: an empty Add form (11 §2.8).
            return Outcome(case, candidate=pipeline.blank(source))
        seconds = time.perf_counter() - started
    if not output.get("is_subscription_email"):
        return Outcome(case, rejected=pipeline.NOT_A_SUBSCRIPTION, seconds=seconds, usage=usage)
    candidate = pipeline.extract(
        source, output, default_currency=default_currency, catalog=catalog()
    )
    return Outcome(case, candidate=candidate, seconds=seconds, usage=usage)


def _same(name: str, shown, truth, candidate, expected: dict) -> bool:
    if name == "price":
        return Decimal(shown) == Decimal(truth)
    if name == "service_name":
        return pipeline.normalise(shown) == pipeline.normalise(truth)
    if name == "billing_cycle" and shown == "custom":
        pair = (candidate.fields["custom_cycle_count"], candidate.fields["custom_cycle_unit"])
        return shown == truth and pair == (
            expected["custom_cycle_count"],
            expected["custom_cycle_unit"],
        )
    return shown == truth


@dataclass
class FieldScore:
    with_value: int = 0  # emails where the truth has a value
    right: int = 0
    wrong: int = 0
    blank: int = 0  # truth has a value; the pipeline showed none, so the user is asked
    invented: int = 0  # truth has none; something was shown anyway


@dataclass
class Report:
    outcomes: list[Outcome]
    fields: dict[str, FieldScore]
    bands: dict[str, list[int]]  # band -> [shown, right]
    wrong_green: list[tuple[str, str]]
    screened_right: int
    screened_total: int
    hulu_exact: bool


def score(outcomes: list[Outcome]) -> Report:
    fields = {name: FieldScore() for name in SCORED}
    bands = {band: [0, 0] for band in BANDS}
    wrong_green = []
    screened_right = screened_total = 0
    for outcome in outcomes:
        case = outcome.case
        if case["expect"] != "extract":
            screened_total += 1
            screened_right += outcome.rejected == case["expect"]
            continue
        candidate, truth = outcome.candidate, case["truth"]
        if candidate is None:  # wrongly rejected: everything the email had is lost
            for name in SCORED:
                if truth[name] is not None:
                    fields[name].with_value += 1
                    fields[name].blank += 1
            continue
        for name in SCORED:
            shown, expected = candidate.fields[name], truth[name]
            tally = fields[name]
            tally.with_value += expected is not None
            if shown is None:
                tally.blank += expected is not None
                continue
            if expected is None:
                tally.invented += 1
                right = False
            else:
                right = _same(name, shown, expected, candidate, truth)
                tally.right += right
                tally.wrong += not right
            band = pipeline.band(candidate.confidence[name])
            bands[band][0] += 1
            bands[band][1] += right
            if band == "green" and not right:
                wrong_green.append((case["id"], name))
    hulu = next((o for o in outcomes if o.case["id"] == "hulu-trial"), None)
    hulu_exact = bool(
        hulu
        and hulu.candidate
        and all(hulu.candidate.fields[n] == hulu.case["truth"][n] for n in pipeline.FIELDS)
        and not hulu.candidate.flagged
    )
    return Report(outcomes, fields, bands, wrong_green, screened_right, screened_total, hulu_exact)


def run(
    *,
    read: Callable[[pipeline.Source], tuple[dict, dict]] | None = None,
    data: dict | None = None,
) -> Report:
    data = data or load()
    return score(
        [
            run_case(case, default_currency=data["default_currency"], read=read)
            for case in data["emails"]
        ]
    )


def _pct(part: int, whole: int) -> str:
    return f"{100 * part / whole:.0f}%" if whole else "n/a"


def render(report: Report, *, live_model: str | None = None) -> str:
    """The report as Markdown. Deterministic offline, so CI can check it is current."""
    data_cases = [o for o in report.outcomes if o.case["expect"] == "extract"]
    sources = sorted(
        {o.case["model_output_source"] for o in report.outcomes if o.case.get("model_output")}
    )
    lines = ["# Extraction eval", ""]
    if live_model:
        lines += [
            f"**Live run against `{live_model}`.** The model was asked about every",
            "email, so this measures the model and the pipeline together.",
        ]
    else:
        lines += [
            "**Offline run** (`python manage.py eval_extraction`), regenerated and",
            "checked by CI. Model outputs come from the fixtures: "
            + ", ".join(f"`{s}`" for s in sources)
            + ".",
            "",
        ]
        if "synthetic" in sources:
            lines += [
                "While those outputs are `synthetic` -- written by hand, some of them",
                "deliberately wrong -- this measures the **pipeline**: grounding,",
                "computed confidence, flagging and screening. It does **not** measure",
                "the model. `eval_extraction --live` does, into",
                "`extraction-eval-live.md`.",
            ]
    lines += [
        "",
        f"{len(report.outcomes)} hand-labelled emails: {len(data_cases)} to extract,",
        f"{report.screened_total} to reject.",
        "",
        "## What the user would see",
        "",
        "| Field | Emails with a value | Right | Wrong | Blank, user asked | Invented |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for name, tally in report.fields.items():
        lines.append(
            f"| `{name}` | {tally.with_value} | {tally.right} | {tally.wrong} | "
            f"{tally.blank} | {tally.invented} |"
        )
    right = sum(t.right for t in report.fields.values())
    shown = right + sum(t.wrong + t.invented for t in report.fields.values())
    lines += [
        "",
        f"**{right} of {shown} values shown were right ({_pct(right, shown)}).**",
        "A blank is not an error: the pipeline declined to vouch for the value",
        "and the review screen asks the user for it.",
        "",
        "## Calibration",
        "",
        "Does a band mean what its colour claims? For every value shown, by the",
        "band its computed confidence put it in:",
        "",
        "| Band | Confidence | Values shown | Right | Accuracy |",
        "| --- | --- | ---: | ---: | ---: |",
    ]
    ranges = {
        "green": f">= {pipeline.GREEN:.2f}",
        "amber": f"{pipeline.AMBER:.2f} to {pipeline.GREEN:.2f}",
        "flagged": f"< {pipeline.AMBER:.2f}",
    }
    for name, (count, right_in_band) in report.bands.items():
        lines.append(
            f"| {name} | {ranges[name]} | {count} | {right_in_band} | "
            f"{_pct(right_in_band, count)} |"
        )
    lines.append("")
    if report.wrong_green:
        lines.append("**Wrong values shown green** (the failure that matters most):")
        lines += [f"- `{case}`: `{name}`" for case, name in report.wrong_green]
    else:
        lines.append("**No wrong value was shown green.**")
    lines += [
        "",
        "## Screening",
        "",
        f"{report.screened_right} of {report.screened_total} emails that should be "
        "rejected were rejected, for the right reason.",
        "",
        f"Hulu's exact wording (11 §2.7) extracted exactly, nothing flagged: "
        f"**{'yes' if report.hulu_exact else 'no'}**.",
    ]
    timed = [o.seconds for o in report.outcomes if o.seconds is not None]
    if timed:
        tokens_in = sum(o.usage.get("input_tokens", 0) for o in report.outcomes)
        tokens_out = sum(o.usage.get("output_tokens", 0) for o in report.outcomes)
        lines += [
            "",
            "## Cost and latency",
            "",
            f"{len(timed)} model calls. Median {sorted(timed)[len(timed) // 2]:.1f}s, "
            f"slowest {max(timed):.1f}s (section 12's budget is 8s).",
            f"{tokens_in} input and {tokens_out} output tokens in all.",
        ]
    lines += ["", "## Per email", "", "| Email | Outcome | Flagged |", "| --- | --- | --- |"]
    for outcome in report.outcomes:
        if outcome.rejected:
            result, flagged = f"rejected: {outcome.rejected}", ""
        else:
            result = "extracted"
            flagged = ", ".join(f"`{f}`" for f in outcome.candidate.flagged)
        lines.append(f"| `{outcome.case['id']}` | {result} | {flagged} |")
    return "\n".join(lines) + "\n"
