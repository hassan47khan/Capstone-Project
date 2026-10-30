"""The eval harness (11 §2.7): it runs in CI, and its committed report stays true."""

import copy

import pytest
from django.core.management import CommandError, call_command

from extraction import evaluation, llm, pipeline


@pytest.fixture(scope="module")
def data():
    return evaluation.load()


@pytest.fixture(scope="module")
def report():
    return evaluation.run()


def test_there_are_at_least_twenty_hand_labelled_emails(data):
    assert len(data["emails"]) >= 20


def test_the_fixtures_include_hulus_exact_wording(data):
    wording = (
        "Your free trial ends on Oct 19, 2026. After that, you will be charged $17.99 per month."
    )

    assert any(case["text"] == wording for case in data["emails"])


def test_every_label_uses_the_contracts_values(data):
    for case in data["emails"]:
        truth = case["truth"]
        if truth is None:
            continue
        assert set(truth) == set(pipeline.FIELDS), case["id"]
        assert truth["billing_cycle"] in (*pipeline.CYCLES, None), case["id"]
        assert truth["subscription_type"] in pipeline.TYPES, case["id"]
        assert truth["category"] in pipeline.CATEGORIES, case["id"]


def test_every_model_output_says_where_it_came_from(data):
    for case in data["emails"]:
        if case["model_output"] is not None:
            assert case["model_output_source"], case["id"]


def test_the_committed_report_is_what_the_eval_produces(report):
    # Like schema.yml: if the pipeline or the fixtures change, the report
    # must be regenerated (`python manage.py eval_extraction --write`).
    committed = evaluation.OFFLINE_REPORT.read_text(encoding="utf-8")

    assert committed == evaluation.render(report)


def test_no_wrong_value_is_shown_green(report):
    assert report.wrong_green == []


def test_hulu_extracts_exactly(report):
    assert report.hulu_exact is True


def test_every_email_that_should_be_rejected_is(report):
    assert report.screened_right == report.screened_total


def test_an_advert_the_model_calls_not_a_subscription_is_rejected(report):
    peacock = next(o for o in report.outcomes if o.case["id"] == "peacock-advert")

    assert peacock.rejected == pipeline.NOT_A_SUBSCRIPTION


def test_the_deliberate_model_mistakes_are_caught(report):
    by_id = {o.case["id"]: o.candidate for o in report.outcomes}

    assert by_id["github-hallucinated-plan"].fields["plan_name"] is None
    assert by_id["max-wrong-year"].fields["trial_ends_on"] is None
    assert pipeline.band(by_id["netflix-price-change"].confidence["price"]) != "green"


def test_a_model_failure_during_a_live_run_is_a_blank_form(data):
    def down(source):
        raise llm.LLMUnavailable("down")

    hulu = next(case for case in data["emails"] if case["id"] == "hulu-trial")

    outcome = evaluation.run_case(hulu, default_currency="USD", read=down)

    assert outcome.candidate.flagged == list(pipeline.REQUIRED)


def test_a_live_run_reports_latency_and_tokens(data):
    def read(source):
        case = next(c for c in data["emails"] if c["text"] == source.text)
        return case["model_output"], {"input_tokens": 800, "output_tokens": 200}

    text = evaluation.render(evaluation.run(read=read), live_model="claude-opus-5-5")

    assert "Live run against `claude-opus-5-5`" in text
    assert "Cost and latency" in text


def test_a_wrong_value_shown_green_is_reported_by_name(data):
    broken = copy.deepcopy(data)
    hulu = next(case for case in broken["emails"] if case["id"] == "hulu-trial")
    hulu["truth"]["price"] = "18.99"  # the label now disagrees with the email

    text = evaluation.render(evaluation.run(data=broken))

    assert "`hulu-trial`: `price`" in text


# The command ------------------------------------------------------------------------------


def test_the_command_runs_offline_and_prints_the_report(capsys):
    call_command("eval_extraction")

    assert "# Extraction eval" in capsys.readouterr().out


def test_the_command_writes_the_report_when_asked(tmp_path, monkeypatch):
    target = tmp_path / "report.md"
    monkeypatch.setattr(evaluation, "OFFLINE_REPORT", target)

    call_command("eval_extraction", "--write")

    assert target.read_text(encoding="utf-8").startswith("# Extraction eval")


def test_the_command_refuses_a_live_run_without_a_key(settings):
    settings.LLM_API_KEY = None

    with pytest.raises(CommandError, match="LLM_API_KEY"):
        call_command("eval_extraction", "--live")


def test_the_command_fails_when_a_wrong_value_is_shown_green(monkeypatch, data):
    broken = copy.deepcopy(data)
    next(c for c in broken["emails"] if c["id"] == "hulu-trial")["truth"]["price"] = "18.99"
    monkeypatch.setattr(evaluation, "load", lambda: broken)

    with pytest.raises(CommandError, match="shown green"):
        call_command("eval_extraction")


def test_a_live_run_writes_its_own_report(settings, tmp_path, monkeypatch, data):
    settings.LLM_API_KEY = "sk-test"
    target = tmp_path / "live.md"
    monkeypatch.setattr(evaluation, "LIVE_REPORT", target)

    def fake_model(source):
        case = next(c for c in data["emails"] if c["text"] == source.text)
        return llm.Reply(case["model_output"], "claude-opus-5-5", {"input_tokens": 1})

    monkeypatch.setattr(llm, "read_email", fake_model)

    call_command("eval_extraction", "--live", "--write")

    # Kept apart from the offline report CI checks.
    assert "Live run" in target.read_text(encoding="utf-8")
