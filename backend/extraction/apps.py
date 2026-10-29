from django.apps import AppConfig


class ExtractionConfig(AppConfig):
    """The Gmail scan and the AI extraction pipeline (spec section 7, 11 §2).

    Empty until phase 5 adds GmailConnection, PendingExtraction and the
    provider pipeline; it exists now so none of that lands in subscriptions/.
    """

    name = "extraction"
