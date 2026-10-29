"""Root URLconf. The JSON API lives under /api/v1/ (spec section 5)."""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

from accounts.views import ProfileView
from core.views import health

api_v1 = [
    path("health/", health, name="health"),
    # No trailing slash, like every contract path (04 slice 2).
    path("me", ProfileView.as_view(), name="me"),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("", include("accounts.urls")),
    path("", include("subscriptions.urls")),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
    path("", include("core.urls")),
]
