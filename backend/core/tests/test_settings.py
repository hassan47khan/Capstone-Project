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
