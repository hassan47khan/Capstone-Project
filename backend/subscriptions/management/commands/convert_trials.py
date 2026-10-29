from datetime import date

from django.core.management.base import BaseCommand

from subscriptions.tasks import convert_expired_trials


class Command(BaseCommand):
    help = "Turn trials that end on or before today into paying subscriptions (04 §6a)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--today",
            type=date.fromisoformat,
            default=None,
            help="Treat this day (YYYY-MM-DD) as today. Default: today's date.",
        )

    def handle(self, *args, today, **options):
        # The same function the hourly task runs, so the two cannot drift.
        converted = convert_expired_trials(today.isoformat() if today else None)
        self.stdout.write(f"Converted {converted} trial(s).")
