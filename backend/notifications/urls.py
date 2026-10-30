"""Additive routes. No trailing slash, like every contract path (04 slice 2)."""

from django.urls import path

from . import views

urlpatterns = [
    path("devices", views.DevicesView.as_view()),
    path("devices/<str:device_id>", views.DeviceDetailView.as_view()),
    path("notifications", views.NotificationsView.as_view()),
    path("notifications/<str:notification_id>/read", views.NotificationReadView.as_view()),
    path("me/notification-rules", views.NotificationRulesView.as_view()),
]
