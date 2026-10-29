import django.utils.timezone
from django.db import migrations, models

TTL_INDEX = "login_failures_expires_at_ttl"


def create_ttl_index(apps, schema_editor):
    # Django has no TTL index option, so this one is made with PyMongo.
    collection = schema_editor.connection.get_collection("login_failures")
    collection.create_index("expires_at", name=TTL_INDEX, expireAfterSeconds=0)


def drop_ttl_index(apps, schema_editor):
    schema_editor.connection.get_collection("login_failures").drop_index(TTL_INDEX)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_login_failures_per_email'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='loginfailures',
            name='failed_at',
        ),
        migrations.AddField(
            model_name='loginfailures',
            name='count',
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='loginfailures',
            name='window_ends',
            field=models.DateTimeField(default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='loginfailures',
            name='expires_at',
            field=models.DateTimeField(default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.RunPython(create_ttl_index, drop_ttl_index),
    ]
