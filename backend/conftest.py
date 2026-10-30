from pathlib import Path

import pytest
import yaml
from django.core.cache import cache
from jsonschema import Draft202012Validator
from rest_framework.test import APIClient

from subscriptions import seed
from subscriptions.seed import SEED_TODAY, ensure_system_categories

SCHEMA_FILE = Path(__file__).resolve().parent / "schema.yml"
API_PREFIX = "/api/v1"


@pytest.fixture(autouse=True)
def pinned_settings(settings):
    """Every test runs on SEED_TODAY, the day the canonical figures are for."""
    settings.SUBTRAK_TODAY = SEED_TODAY
    # A fast hasher: the tests check the rules around passwords, not PBKDF2.
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
    # Tasks run inline, so a test sees their effect without a worker. A test
    # that wants the broker-down path makes .delay() raise instead.
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True
    # Never a developer's Redis: the suite would then share rate-limit
    # counters between runs, and between itself and a running server.
    settings.CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
    # Nor a developer's backend/.env: with a public origin set, emailed links
    # become the HTTPS bridge, and the tests that read a link out of an
    # email are written for the deep link. The bridge has its own tests.
    settings.PUBLIC_BASE_URL = ""


@pytest.fixture(autouse=True)
def fresh_cache(pinned_settings):
    """Rate-limit counters and resend cooldowns live in the cache.

    Depends on pinned_settings so it clears the locmem cache the test uses.
    Without that ordering, a developer whose backend/.env sets REDIS_URL had
    this clear Redis instead, and cooldowns leaked from one test to the next.
    """
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def categories(db):
    """The seven system categories, by slug. The test database is flushed
    between tests, so anything that needs a category asks for this."""
    return ensure_system_categories()


@pytest.fixture
def alex(db):
    """Alex Kim, with the whole canonical dataset loaded (04 §4), as `seed_demo`
    leaves it: the demo users log in with DEMO_PASSWORD."""
    return seed.load_demo(today=SEED_TODAY, password=seed.DEMO_PASSWORD)[seed.ALEX.email]


@pytest.fixture
def api(alex):
    client = APIClient()
    client.force_authenticate(alex)
    return client


@pytest.fixture(scope="session")
def openapi():
    """The committed contract. CI fails if it differs from the generated one."""
    return yaml.safe_load(SCHEMA_FILE.read_text(encoding="utf-8"))


def _strict(node):
    """No property the schema does not name: an undocumented field is drift too."""
    if isinstance(node, dict):
        node = {key: _strict(value) for key, value in node.items()}
        if "properties" in node and "additionalProperties" not in node:
            node["additionalProperties"] = False
        return node
    if isinstance(node, list):
        return [_strict(item) for item in node]
    return node


@pytest.fixture(scope="session")
def contract(openapi):
    """check(response, path): the response body matches what schema.yml documents
    for that path, method and status code."""
    components = _strict(openapi["components"])

    def check(response, path):
        method = response.request["REQUEST_METHOD"].lower()
        operation = openapi["paths"][API_PREFIX + path][method]
        documented = operation["responses"].get(str(response.status_code))
        assert documented, f"{method.upper()} {path} does not document {response.status_code}"
        if "content" not in documented:
            assert not response.content, "documented with no body, but one was sent"
            return None
        body = response.json()
        schema = {**_strict(documented["content"]["application/json"]["schema"])}
        schema["components"] = components
        validator = Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER)
        problems = [f"{list(e.absolute_path)}: {e.message}" for e in validator.iter_errors(body)]
        assert not problems, "\n".join(problems)
        return body

    return check
