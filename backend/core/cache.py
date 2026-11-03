"""The shared cache, failing open when Redis is away (spec sections 6 and 12).

Only rate-limit counters and resend cooldowns live in the cache, and losing
them for the length of an outage costs nothing that matters: the login
lockout is in MongoDB (`LoginFailures`), so brute force is still bounded.
Django's RedisCache raises instead, which turned a Redis outage into a 500 on
login, register and both resends. Here an unreachable Redis reads as an empty
cache and a write is dropped, so /health/ can say `degraded` and mean it.
"""

import functools
import logging

from django.core.cache.backends.redis import RedisCache
from redis.exceptions import ConnectionError, TimeoutError

logger = logging.getLogger(__name__)

UNREACHABLE = (ConnectionError, TimeoutError)


def _fail_open(fallback):
    """Run the method, or return `fallback(*args, **kwargs)` if Redis is away."""

    def decorate(method):
        @functools.wraps(method)
        def wrapper(self, *args, **kwargs):
            try:
                return method(self, *args, **kwargs)
            except UNREACHABLE:
                logger.warning("Redis unreachable; cache %s skipped.", method.__name__)
                return fallback(*args, **kwargs)

        return wrapper

    return decorate


def _nothing(*args, **kwargs):
    return None


def _default(key, default=None, version=None):
    return default


class FailOpenRedisCache(RedisCache):
    get = _fail_open(_default)(RedisCache.get)
    get_many = _fail_open(lambda keys, version=None: {})(RedisCache.get_many)
    has_key = _fail_open(lambda *args, **kwargs: False)(RedisCache.has_key)
    set = _fail_open(_nothing)(RedisCache.set)
    set_many = _fail_open(lambda *args, **kwargs: [])(RedisCache.set_many)
    # As if the key were new: the caller goes ahead, which is the point.
    add = _fail_open(lambda *args, **kwargs: True)(RedisCache.add)
    incr = _fail_open(lambda key, delta=1, version=None: delta)(RedisCache.incr)
    touch = _fail_open(lambda *args, **kwargs: False)(RedisCache.touch)
    delete = _fail_open(lambda *args, **kwargs: False)(RedisCache.delete)
    delete_many = _fail_open(_nothing)(RedisCache.delete_many)
    clear = _fail_open(lambda: False)(RedisCache.clear)
