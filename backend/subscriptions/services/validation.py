"""Field rules shared by the model, the seed and (later) the API serializers."""

import re
from decimal import Decimal

from .money import minor_unit

PRICE_MESSAGE = "Enter a valid price greater than $0."
PAYMENT_LABEL_MAX = 30

# 13-19 digits is a card number; a longer run contains one. Spaces and dashes
# are dropped first so "4242 4242 4242 4242" is caught too (handoff 04 §1).
_CARD_RUN = re.compile(r"\d{13,}")


def looks_like_card_number(text: str) -> bool:
    return bool(_CARD_RUN.search(re.sub(r"[\s-]", "", text)))


def is_valid_price(price: Decimal | None) -> bool:
    return isinstance(price, Decimal) and price.is_finite() and price > 0


def fits_currency(price: Decimal, currency: str) -> bool:
    """Whether `price` is a whole number of the currency's minor units.

    ¥1000.50 isn't: yen has no cents, so it can't be charged or split exactly.
    """
    return not price % minor_unit(currency)


def currency_precision_message(currency: str) -> str:
    places = -minor_unit(currency).as_tuple().exponent
    if places == 0:
        return f"Enter a whole number. {currency} prices have no cents."
    return f"Use at most {places} decimal places for {currency}."
