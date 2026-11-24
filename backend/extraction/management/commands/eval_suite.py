"""Run the whole AI eval suite with one command, and fail below a threshold.

    python manage.py eval_suite                  # offline: replays stored answers, free
    python manage.py eval_suite --live --write   # asks the model; needs LLM_API_KEY

Exits non-zero when any check falls below its threshold (see
`extraction/eval_suite.py`), which is what fails the pipeline's Eval stage.
A live run stops once it has spent EVAL_MAX_USD (default $0.50).
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from extraction import eval_suite, evaluation, llm


class Command(BaseCommand):
    help = "Run every AI eval check against its threshold. Offline unless --live."

    def add_arguments(self, parser):
        parser.add_argument(
            "--live",
            action="store_true",
            help="Ask the model. Needs LLM_API_KEY; costs money (capped by EVAL_MAX_USD).",
        )
        parser.add_argument(
            "--write", action="store_true", help="Also write the reports under docs/ai/."
        )
        parser.add_argument(
            "--summary",
            metavar="PATH",
            help="Append the report to this file too (CI passes $GITHUB_STEP_SUMMARY).",
        )

    def handle(self, *args, **options):
        live = options["live"]
        meter = None
        read = None
        if live:
            if not settings.LLM_API_KEY:
                raise CommandError("--live needs LLM_API_KEY.")
            meter = eval_suite.Meter(model=llm.model_name(), cap=eval_suite.max_usd())
            read = meter.wrap(llm.read_email)
        try:
            report = eval_suite.run(read=read, meter=meter)
        except eval_suite.BudgetExceeded as error:
            raise CommandError(f"Stopped before the end: {error}.") from error
        except (llm.LLMUnavailable, llm.LLMUnusable) as error:
            raise CommandError(f"The model could not be used: {error}.") from error

        text = eval_suite.render(report)
        self.stdout.write(text)
        if options["summary"]:
            with open(options["summary"], "a", encoding="utf-8") as summary:
                summary.write(text)
        if options["write"]:
            suite_path = eval_suite.LIVE_REPORT if live else eval_suite.OFFLINE_REPORT
            golden_path = evaluation.LIVE_REPORT if live else evaluation.OFFLINE_REPORT
            golden = evaluation.render(report.golden, live_model=report.model)
            for path, body in ((suite_path, text), (golden_path, golden)):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(body, encoding="utf-8", newline="\n")
                self.stdout.write(self.style.SUCCESS(f"Wrote {path}"))
        failed = [check.title for check in report.checks if check.passed is False]
        if failed:
            raise CommandError("Below threshold: " + "; ".join(failed) + ".")
