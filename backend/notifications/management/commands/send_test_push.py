"""Send one real push through Expo, to prove the wiring (phase 4).

Requires --live: the point of this command is that it leaves the machine.
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from notifications import push


class Command(BaseCommand):
    help = "Send one test push to an Expo token. Requires --live."

    def add_arguments(self, parser):
        parser.add_argument("--token", required=True, help="ExponentPushToken[...]")
        parser.add_argument(
            "--live",
            action="store_true",
            help="Actually send. Without it the command only reports the configuration.",
        )

    def handle(self, *args, **options):
        # Whether a token is configured, never the token itself.
        self.stdout.write(f"Endpoint:  {push.SEND_URL}")
        # A bearer token is only needed when enhanced push security is on.
        auth = "bearer token set" if settings.EXPO_ACCESS_TOKEN else "none"
        self.stdout.write(f"Auth:      {auth}")
        self.stdout.write(f"To:        {options['token']}")

        if not options["live"]:
            raise CommandError("This sends a real push. Re-run with --live when you mean it.")

        tickets = push.send(
            [
                push.message_for(
                    options["token"],
                    title="SubTrak test",
                    body="If this arrived, push is wired up.",
                )
            ]
        )
        ticket = tickets[0]
        if not ticket.accepted:
            raise CommandError(f"Expo rejected it: {ticket.error or 'unknown error'}")
        self.stdout.write(self.style.SUCCESS(f"Accepted. Receipt id {ticket.receipt_id}."))
        self.stdout.write("Expo accepting it is not delivery; check the receipt in ~15 minutes.")
