from rest_framework import serializers

from . import insight


class InsightSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=insight.KINDS)
    text = serializers.CharField(help_text="One sentence; every number in it is from the facts.")
    subscription_id = serializers.CharField(
        allow_null=True,
        help_text="The subscription it is about, for tap-through; null for a category.",
    )
    generated = serializers.BooleanField(
        help_text="True if the model worded it; false for the template fallback."
    )


class InsightResponseSerializer(serializers.Serializer):
    insight = InsightSerializer(
        allow_null=True, help_text="Null: there is nothing to say; hide the card."
    )
