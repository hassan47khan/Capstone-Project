from django.urls import path

from . import views

urlpatterns = [
    path("family", views.FamilyView.as_view()),
    path("family/members/<str:membership_id>", views.MemberView.as_view()),
    path("family/invitations", views.InvitationsView.as_view()),
    path("family/invitations/<str:invitation_id>", views.InvitationView.as_view()),
    path("family/invitations/<str:invitation_id>/resend", views.ResendView.as_view()),
    # The token goes in the body, never the path, so the request log never holds one.
    path("invitations/preview", views.PreviewView.as_view()),
    path("invitations/accept", views.AcceptView.as_view()),
]
