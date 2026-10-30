"""Check a real Gmail connection end to end (phase 5). Requires --live.

Run it after connecting Gmail from the app. It refreshes the stored token,
reads the connected address, and counts what the scan's search matches.
With --scan it also runs a real scan, which calls the model and queues
results for review in the app.

It prints counts only: never a sender, a subject or a word of any email.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from core.contract import ApiError
from extraction import gmail, reviews, service


class Command(BaseCommand):
    help = "Check a user's Gmail connection against Google. Requires --live."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True, help="The SubTrak account to check.")
        parser.add_argument("--live", action="store_true", help="Actually call Google.")
        parser.add_argument(
            "--scan",
            action="store_true",
            help="Also run a real scan: calls the model and queues results for review.",
        )

    def handle(self, *args, **options):
        user = get_user_model().objects.filter(email=options["email"]).first()
        if user is None:
            raise CommandError("No SubTrak account with that email.")
        self.stdout.write(f"Search:    {gmail.SEARCH_QUERY}")
        if not options["live"]:
            raise CommandError("This calls Google. Re-run with --live when you mean it.")
        try:
            token = service.access_token_for(user)
        except ApiError as error:
            raise CommandError(error.message) from error
        self.stdout.write(f"Connected: {gmail.profile_email(token)}")
        self.stdout.write(f"Matches:   {len(gmail.search(token))} (at most {gmail.MAX_MESSAGES})")
        if options["scan"]:
            queued = reviews.run_scan(user)
            self.stdout.write(self.style.SUCCESS(f"Queued {queued} for review in the app."))
