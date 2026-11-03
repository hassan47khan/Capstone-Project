"""Root URLconf. The JSON API lives under /api/v1/ (spec section 5)."""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

from accounts.views import ProfileView
from core.links import gmail_callback
from core.views import health

api_v1 = [
    path("health/", health, name="health"),
    # No trailing slash, like every contract path (04 slice 2).
    path("me", ProfileView.as_view(), name="me"),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    # Google's OAuth redirect. A plain Django view, so it stays out of the
    # OpenAPI contract like the /links/ bridge it reuses (core/links.py).
    path("integrations/gmail/callback", gmail_callback, name="gmail-callback"),
    path("", include("accounts.urls")),
    path("", include("subscriptions.urls")),
    path("", include("notifications.urls")),
    path("", include("extraction.urls")),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
    path("", include("core.urls")),
]
