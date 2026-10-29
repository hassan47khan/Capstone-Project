# Importing the Celery app here is what lets @shared_task find it, and what
# makes `celery -A config worker -B` work (config/celery.py).
from .celery import app as celery_app

__all__ = ["celery_app"]
