"""A request id on every response and every log line (spec section 12).

When a user reports "it failed at 3pm", the id in the response they got is
the thread to pull: every log line written while handling that request
carries it. An id the caller sends (`X-Request-ID`, from a proxy or the app)
is kept so a trace can cross services; anything else gets a fresh one.

What is logged is the id, never a header value, token or body.
"""

import contextvars
import logging
import re
import time
import uuid

logger = logging.getLogger("subtrak.request")

HEADER = "X-Request-ID"
# Render polls this every few seconds; logging each poll would bury the rest.
QUIET_PATHS = frozenset({"/api/v1/health/"})
# Kept only if it looks like an id. A free-form header would let a caller
# write whatever they like into the logs, newlines included.
_SAFE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")

# Outside a request (a Celery task, a management command) there is no id.
NONE = "-"
_current: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default=NONE)


def current() -> str:
    return _current.get()


def _accept(value: str | None) -> str:
    if value and _SAFE.fullmatch(value):
        return value
    return uuid.uuid4().hex


class RequestIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = _accept(request.headers.get(HEADER))
        request.request_id = request_id
        token = _current.set(request_id)
        started = time.perf_counter()
        try:
            response = self.get_response(request)
            response[HEADER] = request_id
            if request.path not in QUIET_PATHS:
                # The path only: query strings carry single-use verify tokens
                # and OAuth codes, which is also why gunicorn's access log is off.
                elapsed = (time.perf_counter() - started) * 1000
                logger.info(
                    "%s %s %s %.0fms", request.method, request.path, response.status_code, elapsed
                )
            return response
        finally:
            _current.reset(token)


class RequestIdFilter(logging.Filter):
    """Adds `request_id` to every record, so the format string can use it."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = current()
        return True
