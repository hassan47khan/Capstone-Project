"""Field rules shared by the model, the seed and (later) the API serializers."""

import re
from decimal import Decimal

PRICE_MESSAGE = "Enter a valid price greater than $0."
PAYMENT_LABEL_MAX = 30

# 13-19 digits is a card number; a longer run contains one. Spaces and dashes
# are dropped first so "4242 4242 4242 4242" is caught too (handoff 04 §1).
_CARD_RUN = re.compile(r"\d{13,}")


def looks_like_card_number(text: str) -> bool:
    return bool(_CARD_RUN.search(re.sub(r"[\s-]", "", text)))


def is_valid_price(price: Decimal | None) -> bool:
    return isinstance(price, Decimal) and price.is_finite() and price > 0
