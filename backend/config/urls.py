"""Root URLconf. The JSON API lives under /api/v1/ (spec section 5)."""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

from accounts.views import MeView
from core.views import health

api_v1 = [
    path("health/", health, name="health"),
    path("me/", MeView.as_view(), name="me"),
    # The mobile client calls `/me` without a slash. Serving it directly avoids
    # an APPEND_SLASH redirect, which would break PATCH /me later. Left out of
    # the schema so the operation is documented once.
    path("me", MeView.as_view(schema=None)),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
    path("", include("core.urls")),
]
