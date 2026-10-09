from rest_framework.generics import RetrieveAPIView

from .serializers import UserProfileSerializer


class MeView(RetrieveAPIView):
    """The signed-in user's profile. Authentication comes from the defaults."""

    serializer_class = UserProfileSerializer

    def get_object(self):
        return self.request.user
