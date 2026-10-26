"""Root URLconf. The JSON API lives under /api/v1/ (spec section 5)."""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

from accounts.views import ProfileView
from core.views import health

api_v1 = [
    path("health/", health, name="health"),
    path("me/", ProfileView.as_view(), name="me"),
    # The mobile client calls `/me` without a slash. Serving it directly avoids
    # an APPEND_SLASH redirect, which would drop a PATCH body. Left out of
    # the schema so the operation is documented once.
    path("me", ProfileView.as_view(schema=None)),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("", include("accounts.urls")),
    path("", include("subscriptions.urls")),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
    path("", include("core.urls")),
]
