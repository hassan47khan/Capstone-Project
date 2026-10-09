"""
Contrib app configs that use MongoDB's ObjectId primary key.

From the django-mongodb-backend project template. Django's contrib apps default
to an integer AutoField, which MongoDB cannot generate; these subclasses switch
them to ObjectIdAutoField. Their migrations live in mongo_migrations/ (see
MIGRATION_MODULES) because the stock ones assume integer ids.
"""

from django.contrib.admin.apps import AdminConfig
from django.contrib.auth.apps import AuthConfig
from django.contrib.contenttypes.apps import ContentTypesConfig


class MongoAdminConfig(AdminConfig):
    default_auto_field = "django_mongodb_backend.fields.ObjectIdAutoField"


class MongoAuthConfig(AuthConfig):
    default_auto_field = "django_mongodb_backend.fields.ObjectIdAutoField"


class MongoContentTypesConfig(ContentTypesConfig):
    default_auto_field = "django_mongodb_backend.fields.ObjectIdAutoField"
