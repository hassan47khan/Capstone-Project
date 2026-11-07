from django.apps import AppConfig


class FamilyConfig(AppConfig):
    """Family plans (handoff 10): one family per user, roles, per-member
    permissions, and a family total the server works out.

    Its own app, so the second ownership model stays out of subscriptions/.
    A subscription still belongs to exactly one user; a family only decides
    who else may see it and whether its owner may change it.
    """

    name = "family"
