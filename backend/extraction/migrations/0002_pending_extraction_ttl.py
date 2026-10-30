from django.db import migrations

TTL_INDEX = "pending_extractions_expires_at_ttl"


def create_ttl_index(apps, schema_editor):
    # Django has no TTL index option, so this one is made with PyMongo. It
    # is what makes 11 section 2.9's 24-hour retention true even if nobody
    # ever confirms or discards the review.
    collection = schema_editor.connection.get_collection("pending_extractions")
    collection.create_index("expires_at", name=TTL_INDEX, expireAfterSeconds=0)


def drop_ttl_index(apps, schema_editor):
    schema_editor.connection.get_collection("pending_extractions").drop_index(TTL_INDEX)


class Migration(migrations.Migration):

    dependencies = [
        ("extraction", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_ttl_index, drop_ttl_index),
    ]
