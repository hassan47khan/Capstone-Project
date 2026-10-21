from datetime import date

from django.core.management.base import BaseCommand

from subscriptions import operations
from subscriptions.models import Subscription
from subscriptions.seed import SEED_TODAY, load_demo
from subscriptions.services import money


class Command(BaseCommand):
    help = "Reset and load the canonical demo dataset (handoff 04 §4). Safe to re-run."

    def add_arguments(self, parser):
        parser.add_argument(
            "--today",
            type=date.fromisoformat,
            default=SEED_TODAY,
            help=f"Anchor every seeded date to this day (YYYY-MM-DD). Default {SEED_TODAY}.",
        )

    def handle(self, *args, today, **options):
        users = load_demo(today=today)
        self.stdout.write(f"Seeded the demo dataset anchored on {today}.")
        for user in users.values():
            subs = Subscription.objects.filter(owner=user)
            total = money.monthly_total(
                operations.line_items(subs, today=today), money.BASE_CURRENCY, {}
            )
            self.stdout.write(
                f"  {user.name} <{user.email}>: {subs.count()} subscriptions "
                f"({subs.filter(is_trial=True).count()} on trial), "
                f"${money.round_money(total)}/mo"
            )
