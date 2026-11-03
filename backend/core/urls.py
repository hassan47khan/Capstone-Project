from django.urls import path

from . import links, views

urlpatterns = [
    path("", views.home, name="home"),
    # The HTTPS bridge an emailed link points at (core/links.py). Plain
    # Django views, not DRF, so they stay out of the OpenAPI contract.
    path("links/<str:kind>", links.handoff_page, name="app-handoff"),
]
