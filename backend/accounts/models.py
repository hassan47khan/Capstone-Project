from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Users must have an email address.")
        # Spec section 4: emails are stored lower-cased so the unique index
        # treats Sam@Example.com and sam@example.com as one account.
        user = self.model(email=email.strip().lower(), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    SubTrak account, keyed by email (spec sections 4 and 6).

    Lockout, settings and notification preferences arrive with the stories
    that need them; this model holds only what the /me endpoint and the JWT
    revocation design depend on.
    """

    email = models.EmailField(unique=True)
    # Nullable on purpose: the client's UserProfile types name as `string | null`,
    # and "never set" is different from "set to empty".
    name = models.CharField(max_length=150, null=True, blank=True)  # noqa: DJ001
    # A timestamp rather than a flag, as the spec's users collection defines;
    # the API exposes it as the boolean `email_verified`.
    email_verified_at = models.DateTimeField(null=True, blank=True)
    # Bumped by password reset and "log out everywhere". Spec section 6 has
    # tokens carry it as a `tv` claim and rejects a mismatch; that check is a
    # follow-up, so for now nothing reads this field.
    token_version = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        db_table = "users"

    def __str__(self):
        return self.email

    @property
    def email_verified(self):
        return self.email_verified_at is not None
