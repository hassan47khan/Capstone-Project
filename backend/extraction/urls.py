from django.urls import path

from . import views

urlpatterns = [
    path("analytics/insight", views.InsightView.as_view()),
]
