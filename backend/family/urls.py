from django.urls import path

from . import views

urlpatterns = [
    path("family", views.FamilyView.as_view()),
    path("family/members/<str:membership_id>", views.MemberView.as_view()),
]
