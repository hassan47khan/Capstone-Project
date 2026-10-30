"""Deployment (phase 6): the request id, production hardening, and the
Render Blueprint kept in step with the settings it configures."""

import logging
import os
import re
import secrets
import subprocess
import sys
from pathlib import Path

import pytest
import yaml
from django.conf import settings
from django.test import RequestFactory
from django.urls import resolve

from core import request_id

BACKEND = Path(__file__).resolve().parents[2]
REPO = BACKEND.parent
BLUEPRINT = yaml.safe_load((REPO / "render.yaml").read_text(encoding="utf-8"))
SERVICES = {s["name"]: s for s in BLUEPRINT["services"]}
ENV_EXAMPLE = (BACKEND / ".env.example").read_text(encoding="utf-8")

# Every variable config/settings.py reads, from its own source.
SETTINGS_SOURCE = (BACKEND / "config" / "settings.py").read_text(encoding="utf-8")
READ = set(re.findall(r'os\.environ(?:\.get\(|\[)"([A-Z_]+)"', SETTINGS_SOURCE))
# Set by Render itself, never by us.
FROM_RENDER = {"RENDER", "RENDER_EXTERNAL_HOSTNAME", "RENDER_EXTERNAL_URL"}


# The request id -----------------------------------------------------------------------


@pytest.mark.django_db
def test_every_response_carries_a_request_id(client):
    response = client.get("/api/v1/health/")

    assert re.fullmatch(r"[0-9a-f]{32}", response["X-Request-ID"])


@pytest.mark.django_db
def test_an_id_the_caller_sends_is_kept_so_a_trace_can_cross_services(client):
    response = client.get("/api/v1/health/", HTTP_X_REQUEST_ID="rndr-abc12345")

    assert response["X-Request-ID"] == "rndr-abc12345"


@pytest.mark.django_db
@pytest.mark.parametrize("sent", ["short", "x" * 65, "abc12345\nFAKE LOG LINE", "a b c d e f g h"])
def test_an_id_that_does_not_look_like_one_is_replaced(client, sent):
    # Otherwise a caller could write whatever they liked into the logs.
    response = client.get("/api/v1/health/", HTTP_X_REQUEST_ID=sent)

    assert response["X-Request-ID"] != sent


@pytest.mark.django_db
def test_errors_carry_the_id_too(client):
    assert client.get("/api/v1/me")["X-Request-ID"]  # a 401


def test_code_running_inside_a_request_can_see_its_id():
    seen = {}

    def view(request):
        seen["id"] = request_id.current()
        from django.http import HttpResponse

        return HttpResponse()

    request = RequestFactory().get("/x", HTTP_X_REQUEST_ID="req-12345678")
    request_id.RequestIdMiddleware(view)(request)

    assert seen["id"] == "req-12345678"
    # And it does not leak into whatever runs next.
    assert request_id.current() == request_id.NONE


def test_every_log_line_is_stamped_with_the_id():
    record = logging.LogRecord("x", logging.INFO, __file__, 1, "hello", None, None)

    assert request_id.RequestIdFilter().filter(record) is True
    assert record.request_id == request_id.NONE
    assert "%(request_id)s" in settings.LOGGING["formatters"]["line"]["format"]


@pytest.mark.django_db
def test_the_access_line_logs_the_path_never_the_query_string(client, caplog):
    # A verify link's token and Google's OAuth code both travel in the query.
    with caplog.at_level(logging.INFO, logger="subtrak.request"):
        client.get("/links/verify-email", {"token": "single-use-SECRET"})

    assert "GET /links/verify-email 200" in caplog.text
    assert "single-use-SECRET" not in caplog.text


@pytest.mark.django_db
def test_health_checks_are_not_logged(client, caplog):
    with caplog.at_level(logging.INFO, logger="subtrak.request"):
        client.get("/api/v1/health/")

    assert "/api/v1/health/" not in caplog.text


def test_the_request_id_runs_before_everything_it_should_label():
    assert settings.MIDDLEWARE[0] == "core.request_id.RequestIdMiddleware"
    security = settings.MIDDLEWARE.index("django.middleware.security.SecurityMiddleware")
    assert settings.MIDDLEWARE[security + 1] == "whitenoise.middleware.WhiteNoiseMiddleware"


# Production hardening ----------------------------------------------------------------------


def run_django(*args, **env):
    """manage.py in a fresh process, so module-level settings see `env`."""
    base = {
        k: v
        for k, v in os.environ.items()
        if not k.startswith(("RENDER", "DJANGO_", "SUBTRAK_")) and k != "PYTEST_CURRENT_TEST"
    }
    full = {
        **base,
        "DJANGO_SECRET_KEY": secrets.token_urlsafe(50),
        "DJANGO_DEBUG": "False",
        "MONGODB_URI": os.environ.get("MONGODB_URI", "mongodb://localhost:27017/subtrak"),
        **env,
    }
    return subprocess.run(
        [sys.executable, "manage.py", *args],
        cwd=BACKEND,
        env=full,
        capture_output=True,
        text=True,
        timeout=120,
    )


ON_RENDER = {"RENDER": "true", "RENDER_EXTERNAL_HOSTNAME": "subtrak-api.onrender.com"}


def test_djangos_deployment_checklist_passes_on_render():
    result = run_django("check", "--deploy", "--fail-level", "WARNING", **ON_RENDER)

    assert result.returncode == 0, result.stdout + result.stderr
    # Only the two silenced on purpose (HSTS subdomains and preload).
    assert "no issues (2 silenced)" in result.stdout


def show(env, **expressions):
    """Evaluate each expression against the settings a fresh process loads with `env`."""
    code = "import re; from django.conf import settings as s; " + "; ".join(
        f"print({name!r}, {expr})" for name, expr in expressions.items()
    )
    out = run_django("shell", "-c", code, **env).stdout
    # `shell` prints its own banner first; keep only the answers.
    pairs = (line.strip().split(" ", 1) for line in out.splitlines())
    return {pair[0]: pair[1] for pair in pairs if len(pair) == 2 and pair[0] in expressions}


def test_on_render_https_is_enforced_but_the_health_check_is_not_redirected():
    found = show(
        ON_RENDER,
        redirect="s.SECURE_SSL_REDIRECT",
        cookie="s.SESSION_COOKIE_SECURE",
        health_exempt="any(re.match(p, 'api/v1/health/') for p in s.SECURE_REDIRECT_EXEMPT)",
    )

    assert found == {"redirect": "True", "cookie": "True", "health_exempt": "True"}


def test_on_render_the_service_name_and_url_need_no_typing():
    env = {**ON_RENDER, "RENDER_EXTERNAL_URL": "https://subtrak-api.onrender.com"}
    found = show(
        env,
        host="'subtrak-api.onrender.com' in s.ALLOWED_HOSTS",
        url="s.PUBLIC_BASE_URL",
    )

    assert found == {"host": "True", "url": "https://subtrak-api.onrender.com"}


def test_hardening_can_be_switched_off_explicitly():
    found = show({**ON_RENDER, "DJANGO_SECURE": "false"}, redirect="s.SECURE_SSL_REDIRECT")

    assert found == {"redirect": "False"}


def test_off_render_nothing_redirects_to_https():
    # CI and the suite run with DEBUG off over plain HTTP.
    assert settings.SECURE is False
    assert settings.SECURE_SSL_REDIRECT is False


def test_static_files_are_served_by_whitenoise_from_staticfiles():
    assert settings.STATIC_ROOT == BACKEND / "staticfiles"
    assert "whitenoise" in settings.STORAGES["staticfiles"]["BACKEND"]


# The Blueprint, kept in step with the settings --------------------------------------------


def env_keys(service):
    return {var["key"] for var in service["envVars"]}


def test_exactly_one_worker_runs_and_it_runs_beat():
    workers = [s for s in BLUEPRINT["services"] if s["type"] == "worker"]

    # Two would fire every scheduled job twice (config/celery.py).
    assert len(workers) == 1
    assert "--beat" in workers[0]["startCommand"]
    assert workers[0]["startCommand"].startswith("celery -A config worker")


def test_the_web_service_starts_the_real_app_and_checks_the_real_health_url():
    web = SERVICES["subtrak-api"]

    assert "gunicorn config.wsgi:application" in web["startCommand"]
    assert "--access-logfile" not in web["startCommand"]
    assert resolve(web["healthCheckPath"]).url_name == "health"
    assert "migrate --noinput" in web["buildCommand"]
    assert "collectstatic --noinput" in web["buildCommand"]


def test_every_blueprint_variable_is_one_the_settings_read():
    for service in SERVICES.values():
        if service["type"] == "keyvalue":
            continue
        unknown = env_keys(service) - READ - {"PYTHON_VERSION"}
        assert not unknown, f"{service['name']}: {unknown}"


def test_every_secret_the_blueprint_asks_for_is_documented_in_env_example():
    asked = {
        var["key"]
        for service in SERVICES.values()
        for var in service.get("envVars", [])
        if var.get("sync") is False
    }

    assert all(key in ENV_EXAMPLE for key in asked)


def test_every_variable_the_settings_read_is_documented_in_env_example():
    undocumented = {name for name in READ - FROM_RENDER if name not in ENV_EXAMPLE}

    assert not undocumented


def test_the_worker_and_the_api_share_the_gmail_key():
    # The worker decrypts the refresh tokens the API encrypted.
    for name in ("subtrak-api", "subtrak-worker"):
        assert "GMAIL_TOKEN_ENCRYPTION_KEY" in env_keys(SERVICES[name])


def test_production_never_pins_today_or_turns_debug_on():
    for name in ("subtrak-api", "subtrak-worker"):
        values = {v["key"]: v.get("value") for v in SERVICES[name]["envVars"]}
        assert "SUBTRAK_TODAY" not in values  # that is the demo seed's clock
        assert values["DJANGO_DEBUG"] == "False"


def test_python_is_pinned_to_the_version_ci_tests():
    # Render's own default moved to 3.14, which nothing here has run on.
    for name in ("subtrak-api", "subtrak-worker"):
        version = next(
            v["value"] for v in SERVICES[name]["envVars"] if v["key"] == "PYTHON_VERSION"
        )
        assert version.startswith("3.12.")


def test_the_broker_never_evicts_and_is_not_on_the_internet():
    redis = SERVICES["subtrak-redis"]

    assert redis["maxmemoryPolicy"] == "noeviction"
    assert redis["ipAllowList"] == []
