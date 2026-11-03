"""The Celery app behind SubTrak's scheduled work (spec section 8).

One process runs the worker and beat together:

    celery -A config worker -B -l info

That is deliberate for a project this size -- a separate beat process would
be a second thing to deploy and a second thing to notice when it dies, and
the schedule is five tasks. It does mean exactly one worker may run, or beat
would fire each schedule more than once.

Redis is the broker. Nothing here is a system of record: reminder rows are
written to MongoDB by the API, not by a task, so a broker outage delays work
and never loses it (section 12).
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("subtrak")
# Every CELERY_-prefixed setting in config/settings.py, so there is one place
# to look and the schedule lives in code rather than in a database table.
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
