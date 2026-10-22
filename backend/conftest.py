import pytest

from subscriptions.seed import ensure_system_categories


@pytest.fixture
def categories(db):
    """The seven system categories, by slug. The test database is flushed
    between tests, so anything that needs a category asks for this."""
    return ensure_system_categories()
