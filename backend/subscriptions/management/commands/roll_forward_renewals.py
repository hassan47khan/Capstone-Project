from datetime import date

from django.core.management.base import BaseCommand

from subscriptions.operations import roll_forward_bills


class Command(BaseCommand):
    help = "Move next_bill_date past bills that have gone by, and reschedule their reminders."

    def add_arguments(self, parser):
        parser.add_argument(
            "--today",
            type=date.fromisoformat,
            default=None,
            help="Treat this day (YYYY-MM-DD) as today for everyone. Default: each user's date.",
        )

    def handle(self, *args, today, **options):
        # The same function the hourly task runs, so the two cannot drift.
        rolled = roll_forward_bills(today=today)
        self.stdout.write(f"Rolled {rolled} subscription(s) forward.")
