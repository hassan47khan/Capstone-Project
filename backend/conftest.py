from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator
from rest_framework.test import APIClient

import mocks
from subscriptions.seed import SEED_TODAY, ensure_system_categories

SCHEMA_FILE = Path(__file__).resolve().parent / "schema.yml"
API_PREFIX = "/api/v1"


@pytest.fixture(autouse=True)
def seed_today(settings):
    """Every test runs on SEED_TODAY, the day the canonical figures are for."""
    settings.SUBTRAK_TODAY = SEED_TODAY


@pytest.fixture
def categories(db):
    """The seven system categories, by slug. The test database is flushed
    between tests, so anything that needs a category asks for this."""
    return ensure_system_categories()


@pytest.fixture
def alex(db):
    """The mock API's signed-in user, with the canonical dataset loaded."""
    return mocks.demo_user()


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
