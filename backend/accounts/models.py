from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

from .services.timezones import DEFAULT_SEND_TIME


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


class UserSettings(models.Model):
    """One per user (handoff 04 §1). Created on first read by settings_for()."""

    class Theme(models.TextChoices):
        LIGHT = "light"
        DARK = "dark"
        SYSTEM = "system"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="settings")
    display_currency = models.CharField(max_length=3, default="USD")
    # IANA name; empty means "not set", which US-5 shows as UTC with a flag.
    timezone = models.CharField(max_length=64, blank=True, default="")
    date_format = models.CharField(max_length=20, default="MMM d, yyyy")
    theme = models.CharField(max_length=10, choices=Theme.choices, default=Theme.SYSTEM)
    locale = models.CharField(max_length=20, default="en-US")
    has_completed_first_run = models.BooleanField(default=False)

    class Meta:
        db_table = "user_settings"

    def __str__(self):
        return f"settings for {self.user}"


class NotificationRule(models.Model):
    """One per user (handoff 04 §1). Created on first read by rules_for()."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="notification_rule")
    days_before_reminder = models.PositiveSmallIntegerField(default=3)
    reminder_time = models.TimeField(default=DEFAULT_SEND_TIME)
    send_push = models.BooleanField(default=True)
    send_email = models.BooleanField(default=False)
    alert_on_any_price_change = models.BooleanField(default=True)
    # Only alert when a price rises by at least this amount; null means any rise.
    price_alert_threshold = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    weekly_summary_enabled = models.BooleanField(default=False)
    monthly_report_enabled = models.BooleanField(default=False)
    # Day of the month the monthly report goes out, 1-28 so every month has it.
    report_delivery_day = models.PositiveSmallIntegerField(default=1)
    trial_alert_days_before = models.PositiveSmallIntegerField(default=2)

    class Meta:
        db_table = "notification_rules"

    def __str__(self):
        return f"notification rules for {self.user}"


def settings_for(user) -> UserSettings:
    return UserSettings.objects.get_or_create(user=user)[0]


def rules_for(user) -> NotificationRule:
    return NotificationRule.objects.get_or_create(user=user)[0]
