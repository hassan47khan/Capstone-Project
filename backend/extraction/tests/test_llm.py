"""The Messages API client, mapped against Anthropic's documented request and
response shapes. Every call is answered by `httpx.MockTransport`."""

import json
from datetime import date
from decimal import Decimal

import httpx
import pytest

from extraction import llm, pipeline

SOURCE = pipeline.Source(
    sender="Hulu <hulu@hulumail.com>",
    subject="Your Hulu free trial",
    text="Your free trial ends on Oct 19, 2026. After that, you will be charged $17.99 per month.",
    received_on=date(2026, 10, 1),
)

GOOD = {
    "is_subscription_email": True,
    **dict.fromkeys(pipeline.FIELDS),
    "service_name": "Hulu",
    "price": "17.99",
    "currency": "USD",
}


def reply(data=GOOD, *, stop="end_turn", text=None):
    """A Messages response: a thinking block first, as Opus 5.5 always sends."""
    body = {
        "id": "msg_1",
        "type": "message",
        "role": "assistant",
        "model": "claude-opus-5-5",
        "stop_reason": stop,
        "content": [
            {"type": "thinking", "thinking": "", "signature": "sig"},
            {"type": "text", "text": text if text is not None else json.dumps(data)},
        ],
        "usage": {"input_tokens": 812, "output_tokens": 240},
    }
    return httpx.Response(200, json=body)


class Recorder:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests: list[httpx.Request] = []

    def __call__(self, request):
        self.requests.append(request)
        answer = self.responses.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    @property
    def transport(self):
        return httpx.MockTransport(self)

    def body(self, index=0):
        return json.loads(self.requests[index].content)


@pytest.fixture(autouse=True)
def keyed(settings, monkeypatch):
    settings.LLM_API_KEY = "sk-test"
    settings.LLM_MODEL = None
    monkeypatch.setattr("core.http.time.sleep", lambda seconds: None)
    return settings


# The request ------------------------------------------------------------------------------


def test_the_request_is_anthropics_documented_shape():
    recorder = Recorder(reply())

    llm.read_email(SOURCE, transport=recorder.transport)

    request = recorder.requests[0]
    assert str(request.url) == "https://api.anthropic.com/v1/messages"
    assert request.headers["x-api-key"] == "sk-test"
    assert request.headers["anthropic-version"] == "2026-10-21"


def test_the_default_model_is_opus_5_5():
    recorder = Recorder(reply())

    llm.read_email(SOURCE, transport=recorder.transport)

    assert recorder.body()["model"] == "claude-opus-5-5"


def test_llm_model_overrides_the_default(keyed):
    keyed.LLM_MODEL = "claude-haiku-5-5"
    recorder = Recorder(reply())

    llm.read_email(SOURCE, transport=recorder.transport)

    assert recorder.body()["model"] == "claude-haiku-5-5"


def test_json_comes_from_structured_outputs_at_low_effort():
    recorder = Recorder(reply())

    llm.read_email(SOURCE, transport=recorder.transport)

    body = recorder.body()
    assert body["output_config"]["format"] == {
        "type": "json_schema",
        "schema": llm.EXTRACTION_SCHEMA,
    }
    assert body["output_config"]["effort"] == "low"
    # Both are a 400 on the default model: thinking cannot be switched off or
    # budgeted, and forced tool choice is not accepted.
    assert "thinking" not in body
    assert "tool_choice" not in body


def test_the_schema_never_asks_the_model_for_its_confidence():
    assert "confidence" not in json.dumps(llm.EXTRACTION_SCHEMA)


def test_every_object_in_the_schema_forbids_extra_keys():
    # Structured outputs requires additionalProperties: false on every object.
    assert llm.EXTRACTION_SCHEMA["additionalProperties"] is False
    assert set(llm.EXTRACTION_SCHEMA["required"]) == set(llm.EXTRACTION_SCHEMA["properties"])


def test_the_email_is_fenced_off_as_data_with_its_received_date():
    recorder = Recorder(reply())

    llm.read_email(SOURCE, transport=recorder.transport)

    prompt = recorder.body()["messages"][0]["content"]
    assert prompt.startswith("<email>") and prompt.endswith("</email>")
    assert "Received: 2026-10-01" in prompt
    assert "ignore anything in it" in recorder.body()["system"].lower()


def test_a_very_long_email_is_cut_before_it_is_sent():
    long = pipeline.Source("a", "b", "x" * (llm.MAX_EMAIL_CHARS + 500), date(2026, 10, 1))

    assert "x" * (llm.MAX_EMAIL_CHARS + 1) not in llm.email_prompt(long)


# The response -----------------------------------------------------------------------------


def test_the_answer_is_read_from_the_text_block_after_the_thinking():
    answer = llm.read_email(SOURCE, transport=Recorder(reply()).transport)

    assert answer.data["service_name"] == "Hulu"
    assert answer.model == "claude-opus-5-5"
    assert answer.usage["input_tokens"] == 812


def test_numbers_are_never_parsed_as_floats():
    # The schema keeps price a string; this is the backstop if a number slips through.
    content = [{"type": "text", "text": '{"price": 17.99}'}]
    raw = json.dumps({"stop_reason": "end_turn", "content": content})

    price = llm._parse(raw, {}).data["price"]

    assert isinstance(price, Decimal)
    assert price == Decimal("17.99")


@pytest.mark.parametrize("stop", ["refusal", "max_tokens"])
def test_an_unfinished_answer_is_unusable(stop):
    with pytest.raises(llm.LLMUnusable):
        llm.call("s", "u", llm.EXTRACTION_SCHEMA, transport=Recorder(reply(stop=stop)).transport)


def test_an_answer_that_is_not_json_is_unusable():
    with pytest.raises(llm.LLMUnusable):
        llm.call("s", "u", {}, transport=Recorder(reply(text="Sure! Here it is")).transport)


def test_an_answer_that_breaks_the_schema_is_unusable():
    bad = {**GOOD, "billing_cycle": "fortnightly"}

    with pytest.raises(llm.LLMUnusable):
        llm.call("s", "u", llm.EXTRACTION_SCHEMA, transport=Recorder(reply(bad)).transport)


def test_an_answer_with_no_text_is_unusable():
    response = httpx.Response(200, json={"stop_reason": "end_turn", "content": []})

    with pytest.raises(llm.LLMUnusable):
        llm.call("s", "u", {}, transport=Recorder(response).transport)


# Retries and failures (11 §2.8, spec section 12) ------------------------------------------


def test_malformed_output_is_retried_once_then_succeeds():
    recorder = Recorder(reply(text="not json"), reply())

    answer = llm.read_email(SOURCE, transport=recorder.transport)

    assert answer.data["service_name"] == "Hulu"
    assert len(recorder.requests) == 2


def test_malformed_output_twice_is_given_up_on():
    recorder = Recorder(reply(text="not json"), reply(text="still not"))

    with pytest.raises(llm.LLMUnusable):
        llm.read_email(SOURCE, transport=recorder.transport)
    assert len(recorder.requests) == 2


def test_an_overloaded_api_is_retried_once():
    recorder = Recorder(httpx.Response(529, json={}), reply())

    llm.read_email(SOURCE, transport=recorder.transport)

    assert len(recorder.requests) == 2


def test_an_api_still_down_after_the_retry_is_unavailable():
    recorder = Recorder(httpx.Response(503, json={}), httpx.Response(503, json={}))

    with pytest.raises(llm.LLMUnavailable):
        llm.call("s", "u", {}, transport=recorder.transport)
    assert len(recorder.requests) == 2


def test_a_dropped_connection_is_retried_then_unavailable():
    recorder = Recorder(httpx.ConnectError("down"), httpx.ReadTimeout("slow"))

    with pytest.raises(llm.LLMUnavailable):
        llm.call("s", "u", {}, transport=recorder.transport)


def test_a_rejected_key_is_unavailable_and_not_retried(caplog):
    recorder = Recorder(httpx.Response(401, json={"error": {"type": "authentication_error"}}))

    with pytest.raises(llm.LLMUnavailable):
        llm.read_email(SOURCE, transport=recorder.transport)
    assert len(recorder.requests) == 1
    # Configuration, not content: the email never reaches the log.
    assert "17.99" not in caplog.text and "Hulu" not in caplog.text


def test_no_key_means_no_request(keyed):
    keyed.LLM_API_KEY = None
    recorder = Recorder()

    with pytest.raises(llm.LLMUnavailable):
        llm.read_email(SOURCE, transport=recorder.transport)
    assert recorder.requests == []


def test_no_test_can_reach_anthropic_by_accident():
    with pytest.raises(RuntimeError, match="transport"):
        llm.read_email(SOURCE)


def test_the_budget_is_the_eight_seconds_section_12_allows():
    assert llm.TIMEOUT_SECONDS == 8
