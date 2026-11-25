"""The prompts the AI features send, one versioned text file each.

A prompt is changed by adding a new file (`extraction_v2.txt`) and pointing
the feature's `*_PROMPT` constant at it, never by editing a released file in
place. That way every eval report names the exact prompt it measured, and an
old result can be reproduced by checking the old version out.
"""

from functools import cache
from pathlib import Path

DIRECTORY = Path(__file__).resolve().parent


@cache
def load(name: str) -> str:
    """The prompt `name` (for example `extraction_v1`), without its final newline."""
    return (DIRECTORY / f"{name}.txt").read_text(encoding="utf-8").rstrip("\n")
