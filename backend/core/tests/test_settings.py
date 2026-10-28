import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]


def load_settings(**env):
    """Import settings in a fresh interpreter with the given variables."""
    return subprocess.run(
        [sys.executable, "-c", "import config.settings as s; print(s.DEBUG)"],
        cwd=BACKEND,
        env={**os.environ, **env},
        capture_output=True,
        text=True,
    )


def test_settings_refuse_to_load_without_a_secret_key():
    # Empty rather than unset: python-dotenv never overrides a variable that
    # exists, so this also keeps a developer's backend/.env from filling it in.
    result = load_settings(DJANGO_SECRET_KEY="")

    assert result.returncode != 0
    assert "ImproperlyConfigured" in result.stderr


def test_debug_is_off_unless_explicitly_true():
    result = load_settings(DJANGO_SECRET_KEY="test", DJANGO_DEBUG="")

    assert result.stdout.strip() == "False"


def test_subtrak_today_is_read_as_a_date():
    result = subprocess.run(
        [sys.executable, "-c", "import config.settings as s; print(repr(s.SUBTRAK_TODAY))"],
        cwd=BACKEND,
        env={**os.environ, "DJANGO_SECRET_KEY": "test", "SUBTRAK_TODAY": "2026-10-01"},
        capture_output=True,
        text=True,
    )
    assert result.stdout.strip() == "datetime.date(2026, 10, 1)"


def read_setting(expression, **env):
    """Evaluate one settings value in a fresh interpreter, as its repr.

    Each case passes the variable explicitly rather than relying on it being
    absent, because python-dotenv fills anything a developer has put in their
    own backend/.env and the result would differ per machine.
    """
    result = subprocess.run(
        [sys.executable, "-c", f"import config.settings as s; print(repr(s.{expression}))"],
        cwd=BACKEND,
        env={**os.environ, "DJANGO_SECRET_KEY": "test", **env},
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def test_the_extraction_kill_switch_reads_as_a_boolean():
    assert read_setting("EXTRACTION_ENABLED", EXTRACTION_ENABLED="true") == "True"
    assert read_setting("EXTRACTION_ENABLED", EXTRACTION_ENABLED=" TRUE ") == "True"
    assert read_setting("EXTRACTION_ENABLED", EXTRACTION_ENABLED="false") == "False"
    # Anything that is not "true" leaves the feature off, which is the safe
    # direction for a kill switch, and matches how DJANGO_DEBUG reads.
    assert read_setting("EXTRACTION_ENABLED", EXTRACTION_ENABLED="") == "False"


def test_the_daily_extraction_cap_reads_as_a_number():
    assert read_setting("EXTRACTION_DAILY_CAP", EXTRACTION_DAILY_CAP="5") == "5"


def test_the_oauth_redirect_allowlist_is_split_and_trimmed():
    allowlist = read_setting(
        "GOOGLE_OAUTH_REDIRECT_URIS",
        GOOGLE_OAUTH_REDIRECT_URIS=" https://a.test/cb , https://b.test/cb ,, ",
    )

    assert allowlist == "['https://a.test/cb', 'https://b.test/cb']"


def test_an_empty_oauth_redirect_allowlist_allows_nothing():
    assert read_setting("GOOGLE_OAUTH_REDIRECT_URIS", GOOGLE_OAUTH_REDIRECT_URIS="") == "[]"


def test_the_public_base_url_never_keeps_a_trailing_slash():
    # Callers join paths onto it, so one stray slash would send verification
    # links to //links/verify-email.
    assert (
        read_setting("PUBLIC_BASE_URL", SUBTRAK_PUBLIC_BASE_URL="https://api.test/")
        == "'https://api.test'"
    )
