"""Send one real email, to prove the mailer is wired up (phase 1).

Not part of any test run: --live is required, because the point of this
command is that it reaches the outside world.
"""

from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand, CommandError

SUBJECT = "SubTrak test email"
BODY = (
    "This is a test from `manage.py send_test_email`.\n\n"
    "If it arrived, the mailer configured on this server works.\n"
)


class Command(BaseCommand):
    help = "Send one test email through the configured mailer. Requires --live."

    def add_arguments(self, parser):
        parser.add_argument("address", help="Where to send it.")
        parser.add_argument(
            "--live",
            action="store_true",
            help="Actually send. Without it the command only reports the configuration.",
        )

    def handle(self, *args, **options):
        # The backend path and the From address, never the API key.
        backend = settings.MAILERS["default"]["BACKEND"]
        self.stdout.write(f"Mailer:  {backend}")
        self.stdout.write(f"From:    {settings.DEFAULT_FROM_EMAIL}")
        self.stdout.write(f"To:      {options['address']}")

        if backend.endswith("console.EmailBackend"):
            self.stdout.write(
                self.style.WARNING(
                    "RESEND_API_KEY is not set, so this prints to the console instead of sending."
                )
            )

        if not options["live"]:
            raise CommandError("This sends a real email. Re-run with --live when you mean it.")

        sent = send_mail(SUBJECT, BODY, None, [options["address"]])
        if not sent:
            raise CommandError("The mailer accepted no messages. Check the key and the sender.")
        self.stdout.write(self.style.SUCCESS("Sent 1 message."))
