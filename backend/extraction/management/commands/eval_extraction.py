"""Score the extraction pipeline against the hand-labelled fixtures (11 §2.7).

Offline by default: the fixtures' stored model outputs go through the real
pipeline, and nothing leaves the machine. CI checks that the committed
report matches this run.

With --live the model is asked about every email for real. That needs
LLM_API_KEY, costs money, and is Hassan's to run.
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from extraction import evaluation, llm


def _read_live(source):
    reply = llm.read_email(source)
    return reply.data, reply.usage


class Command(BaseCommand):
    help = "Score extraction against the fixtures. Offline unless --live."

    def add_arguments(self, parser):
        parser.add_argument(
            "--live",
            action="store_true",
            help="Ask the model about every fixture. Needs LLM_API_KEY; costs money.",
        )
        parser.add_argument(
            "--write",
            action="store_true",
            help="Also write the report under docs/ai/.",
        )

    def handle(self, *args, **options):
        live = options["live"]
        if live and not settings.LLM_API_KEY:
            raise CommandError("--live needs LLM_API_KEY in backend/.env.")
        report = evaluation.run(read=_read_live if live else None)
        text = evaluation.render(report, live_model=llm.model_name() if live else None)
        self.stdout.write(text)
        if options["write"]:
            path = evaluation.LIVE_REPORT if live else evaluation.OFFLINE_REPORT
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8", newline="\n")
            self.stdout.write(self.style.SUCCESS(f"Wrote {path}"))
        if report.wrong_green:
            raise CommandError(f"{len(report.wrong_green)} wrong value(s) shown green.")
