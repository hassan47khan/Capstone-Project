"""Encryption at rest for Gmail refresh tokens (handoff 11 §2.9).

Fernet is authenticated: a ciphertext that was tampered with, or encrypted
under a different key, fails to decrypt rather than decrypting to garbage.
There is deliberately no fallback key. With `GMAIL_TOKEN_ENCRYPTION_KEY`
unset, Gmail stops working instead of encrypting with something that is in
the repository.
"""

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

__all__ = ["InvalidToken", "decrypt", "encrypt"]


def _fernet() -> Fernet:
    key = settings.GMAIL_TOKEN_ENCRYPTION_KEY
    if not key:
        raise ImproperlyConfigured(
            "GMAIL_TOKEN_ENCRYPTION_KEY is not set; Gmail tokens cannot be stored."
        )
    return Fernet(key)


def encrypt(token: str) -> str:
    return _fernet().encrypt(token.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """The token, or InvalidToken if the ciphertext was altered or the key changed."""
    return _fernet().decrypt(ciphertext.encode()).decode()
