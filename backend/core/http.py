"""One HTTP client for every outside service SubTrak calls.

Spec section 12 gives each dependency a timeout, a bounded retry policy and a
named fallback. Putting the client factory and the retry loop here means a new
integration inherits the timeout and the user agent instead of re-inventing
them, and the suite gets a single seam -- pass `transport=httpx.MockTransport`
-- so no test ever reaches the network.

The budgets themselves stay with the caller, because they differ per service
(section 12: 8s for the LLM, 10s for push and Gmail, 5s for email).
"""

import random
import time
from collections.abc import Callable

import httpx

# Identifies SubTrak to the services it calls, so an operator reading their
# logs can tell which client made the request.
USER_AGENT = "SubTrak/1.0 (+https://github.com/hassan47khan/Capstone-Project)"


def build_client(
    *,
    timeout: float,
    headers: dict[str, str] | None = None,
    transport: httpx.BaseTransport | None = None,
) -> httpx.Client:
    """An `httpx.Client` carrying SubTrak's user agent and a whole-call budget.

    `timeout` is in seconds and covers connect, read, write and pool alike, so
    a service that accepts the connection and then stalls still gives up on
    schedule. `transport` is the test seam.
    """
    return httpx.Client(
        timeout=httpx.Timeout(timeout),
        headers={"User-Agent": USER_AGENT, **(headers or {})},
        transport=transport,
    )


def backoff_delays(
    retries: int,
    *,
    base: float,
    factor: float = 2.0,
    jitter: float = 0.25,
    rng: random.Random | None = None,
) -> list[float]:
    """The waits, in seconds, before each of `retries` retries.

    Exponential from `base` (base, base*factor, base*factor**2 ...), each
    scaled by a random factor in [1 - jitter, 1 + jitter]. The jitter is the
    point: section 12 asks for "exponential with jitter" so that workers which
    failed together do not all retry on the same tick and fail together again.
    """
    source = rng or random
    return [
        max(0.0, base * factor**step * source.uniform(1 - jitter, 1 + jitter))
        for step in range(retries)
    ]


def call_with_retries[T](
    operation: Callable[[], T],
    *,
    retries: int,
    base_delay: float,
    factor: float = 2.0,
    jitter: float = 0.25,
    retry_on: type[Exception] | tuple[type[Exception], ...] = httpx.TransportError,
    sleep: Callable[[float], None] = time.sleep,
    rng: random.Random | None = None,
) -> T:
    """Call `operation` until it returns, with at most `retries` extra tries.

    Exactly `retries + 1` attempts are made, so the policy is bounded whatever
    the service does. The final failure is re-raised rather than swallowed,
    because every caller has a named fallback to run (section 12) and a `None`
    would hide the difference between "no result" and "never asked".

    `sleep` and `rng` are injected so the tests can prove the backoff without
    actually waiting.
    """
    delays = backoff_delays(retries, base=base_delay, factor=factor, jitter=jitter, rng=rng)
    for delay in delays:
        try:
            return operation()
        except retry_on:
            sleep(delay)
    return operation()
