from django.urls import path

from . import views

# Paths have no trailing slash, as the mobile client calls them (04 §5).
urlpatterns = [
    path("auth/register", views.RegisterView.as_view()),
    path("auth/verify-email", views.VerifyEmailView.as_view()),
    path("auth/resend-verification", views.ResendVerificationView.as_view()),
    path("auth/login", views.LoginView.as_view()),
    path("auth/refresh", views.RefreshView.as_view()),
    path("auth/logout", views.LogoutView.as_view()),
    path("auth/password-reset/request", views.PasswordResetRequestView.as_view()),
    path("auth/password-reset/confirm", views.PasswordResetConfirmView.as_view()),
    path("auth/me", views.AuthMeView.as_view()),
]
