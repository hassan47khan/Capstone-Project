from django.conf import settings
from django.db import models
from django_mongodb_backend.fields import (
    EmbeddedModelArrayField,
    EmbeddedModelField,
    ObjectIdField,
)
from django_mongodb_backend.indexes import EmbeddedFieldIndex
from django_mongodb_backend.models import EmbeddedModel


class Participant(EmbeddedModel):
    email = models.EmailField()
    # Filled in when a verified user with this email claims the invitation.
    user_id = ObjectIdField(null=True, blank=True)


class Sharing(EmbeddedModel):
    split_method = models.CharField(max_length=20, default="equal")
    # Spec section 4 caps a shared plan at 20 participants.
    participants = EmbeddedModelArrayField(Participant, max_size=20, default=list)


class Subscription(models.Model):
    """
    Spike-sized subscription: just enough to prove embedding and an
    embedded-field index. Price, cycle, trial, contract and revisions come
    with US-6 and US-7.
    """

    # A ForeignKey rather than a bare ObjectId so ownership is enforced by
    # Django and queries can filter on owner directly. Stored as `owner_id`.
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="subscriptions"
    )
    name = models.CharField(max_length=100)
    # Embedded: participants are always read with their plan and are bounded.
    sharing = EmbeddedModelField(Sharing, null=True, blank=True)

    class Meta:
        db_table = "subscriptions"
        indexes = [
            # Serves claiming invitations at registration (spec section 4).
            # Since backend 6.1, an index on a field inside an embedded model
            # must be declared here, on the top-level model, with
            # EmbeddedFieldIndex; a plain Index rejects the dotted path.
            EmbeddedFieldIndex(
                fields=["sharing.participants.email"],
                name="subs_participant_email",
            ),
        ]

    def __str__(self):
        return self.name
