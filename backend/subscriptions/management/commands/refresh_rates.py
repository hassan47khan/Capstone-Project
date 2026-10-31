"""Fetch exchange rates from Frankfurter now (phase 3).

Requires --live, because it is the one way to reach the provider by hand.
Nothing in the suite runs it.
"""

from django.core.management.base import BaseCommand, CommandError

from subscriptions import fx


class Command(BaseCommand):
    help = "Fetch today's exchange rates from Frankfurter. Requires --live."

    def add_arguments(self, parser):
        parser.add_argument(
            "--live",
            action="store_true",
            help="Actually call Frankfurter. Without it the command only reports what it would do.",
        )

    def handle(self, *args, **options):
        self.stdout.write(f"Source:     {fx.RATES_URL}?base={fx.BASE.lower()}")
        self.stdout.write(f"Storing:    {', '.join(fx.SUPPORTED_CURRENCIES)}")

        if not options["live"]:
            raise CommandError("This calls Frankfurter. Re-run with --live when you mean it.")

        try:
            written = fx.refresh()
        except Exception as error:
            # Section 12's fallback: the rates already stored stay usable.
            raise CommandError(f"Fetch failed, keeping the stored rates: {error}") from error
        self.stdout.write(self.style.SUCCESS(f"Stored {written} rate(s)."))
