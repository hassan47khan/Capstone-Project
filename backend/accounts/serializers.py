from rest_framework import serializers

from .models import User


class UserProfileSerializer(serializers.ModelSerializer):
    """Matches `UserProfile` in mobile/src/api/types.ts."""

    # ObjectId is not JSON; the client treats ids as opaque strings.
    id = serializers.CharField(read_only=True)
    email_verified = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "name", "email_verified"]
        read_only_fields = fields
