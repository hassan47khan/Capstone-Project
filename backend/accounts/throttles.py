"""Rate limits on login, register and both resend endpoints (handoff 04 §5),
per IP and per email (spec section 5). Rates are in REST_FRAMEWORK settings.
The login lockout and the resend cooldown are separate rules, in accounts.auth.

The per-IP bucket is keyed on REMOTE_ADDR alone. DRF's default `get_ident`
trusts the client's X-Forwarded-For when NUM_PROXIES is unset, so rotating that
header would reset the bucket. If the API goes behind a proxy, the proxy setup
has to put the real client address in REMOTE_ADDR; this class never trusts a
header for it."""

import hashlib

from rest_framework.throttling import SimpleRateThrottle


class AuthIPThrottle(SimpleRateThrottle):
    scope = "auth_ip"

    def get_cache_key(self, request, view):
        ident = request.META.get("REMOTE_ADDR") or "unknown"
        return self.cache_format % {"scope": self.scope, "ident": ident}


class AuthEmailThrottle(SimpleRateThrottle):
    scope = "auth_email"

    def get_cache_key(self, request, view):
        email = request.data.get("email") if hasattr(request.data, "get") else None
        if not isinstance(email, str) or not email.strip():
            return None  # The serializer rejects it; nothing to count.
        ident = hashlib.sha256(email.strip().lower().encode()).hexdigest()
        return self.cache_format % {"scope": self.scope, "ident": ident}
