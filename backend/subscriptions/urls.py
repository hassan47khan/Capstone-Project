from django.urls import path

from . import ai_views, views

# Paths have no trailing slash, as the mobile client calls them (04 §5, §6a).
urlpatterns = [
    path("subscriptions", views.SubscriptionsView.as_view()),
    path("subscriptions/<str:subscription_id>", views.SubscriptionDetailView.as_view()),
    path("subscriptions/<str:subscription_id>/cancel", views.CancelView.as_view()),
    path("subscriptions/<str:subscription_id>/restore", views.RestoreView.as_view()),
    path("subscriptions/<str:subscription_id>/history", views.HistoryView.as_view()),
    path("analytics/summary", views.SummaryView.as_view()),
    path("analytics/spend-over-time", views.SpendOverTimeView.as_view()),
    path("analytics/upcoming", views.UpcomingView.as_view()),
    path("analytics/price-changes", views.PriceChangesView.as_view()),
    path("extractions/scan", ai_views.ScanView.as_view()),
    path("extractions/pending", ai_views.PendingExtractionsView.as_view()),
    path("extractions/<str:extraction_id>", ai_views.ExtractionView.as_view()),
    path("extractions/<str:extraction_id>/confirm", ai_views.ConfirmExtractionView.as_view()),
    path("trials", ai_views.TrialsView.as_view()),
    path("trials/<str:subscription_id>/decision", ai_views.TrialDecisionView.as_view()),
    path("shared-plans", ai_views.SharedPlansView.as_view()),
    path(
        "shared-plans/<str:plan_id>/payments/<str:payment_id>/remind",
        ai_views.RemindView.as_view(),
    ),
    path("integrations/gmail/connect", ai_views.GmailConnectView.as_view()),
    path("integrations/gmail", ai_views.GmailView.as_view()),
]
