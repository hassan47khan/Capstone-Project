from datetime import date

from django.core.management.base import BaseCommand
from django.utils import timezone

from subscriptions.operations import convert_due_trials


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
        converted = convert_due_trials(today=today or timezone.localdate())
        self.stdout.write(f"Converted {converted} trial(s).")
