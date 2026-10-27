"""OpenAPI: document VersionedJWTAuthentication as the same bearer JWT scheme."""

from drf_spectacular.contrib.rest_framework_simplejwt import SimpleJWTScheme


class VersionedJWTScheme(SimpleJWTScheme):
    target_class = "accounts.authentication.VersionedJWTAuthentication"
