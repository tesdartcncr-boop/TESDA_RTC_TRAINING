import logging
from datetime import timedelta
import json
import os
from typing import Any, Optional

import redis

logger = logging.getLogger(__name__)

class CacheManager:
    def __init__(self, redis_url: str | None = None, host: str = 'localhost', port: int = 6379, db: int = 0, ttl_minutes: int = 30):
        """
        Initialize Redis cache manager
        
        Args:
            redis_url: Redis connection URL. If missing, cache is disabled.
            host: Redis server host
            port: Redis server port
            db: Redis database number
            ttl_minutes: Default time to live for cache entries in minutes
        """
        if not redis_url:
            self.redis_client = None
            self.ttl = timedelta(minutes=ttl_minutes)
            self.enabled = False
            logger.info("Redis cache not configured; cache disabled.")
            return

        try:
            self.redis_client = redis.Redis.from_url(redis_url, decode_responses=True)
            self.redis_client.ping()
            self.ttl = timedelta(minutes=ttl_minutes)
            self.enabled = True
            logger.info("Redis cache connected successfully")
        except Exception as e:
            logger.warning(f"Redis cache connection failed: {e}. Cache will be disabled.")
            self.redis_client = None
            self.enabled = False

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        if not self.enabled:
            return None
        try:
            value = self.redis_client.get(key)
            if value is not None:
                logger.debug(f"Cache hit for key: {key}")
                return json.loads(value)
            logger.debug(f"Cache miss for key: {key}")
            return None
        except Exception as e:
            logger.exception("Error retrieving from cache: %s", e)
            return None

    def _normalize_ttl(self, ttl: Optional[timedelta | int | float]) -> timedelta:
        if ttl is None:
            return self.ttl

        if isinstance(ttl, timedelta):
            return ttl

        if isinstance(ttl, (int, float)):
            # Existing callers pass milliseconds (for example 300000 for 5 minutes).
            if ttl >= 1000:
                return timedelta(milliseconds=ttl)
            return timedelta(seconds=ttl)

        logger.warning("Unsupported cache TTL %r, falling back to default", ttl)
        return self.ttl

    def set(self, key: str, value: Any, ttl: Optional[timedelta | int | float] = None) -> bool:
        """Set value in cache with TTL"""
        if not self.enabled:
            return False
        try:
            normalized_ttl = self._normalize_ttl(ttl)
            self.redis_client.setex(key, normalized_ttl, json.dumps(value))
            logger.debug("Cache set for key: %s ttl=%ss", key, int(normalized_ttl.total_seconds()))
            return True
        except Exception as e:
            logger.exception("Error setting cache: %s", e)
            return False

    def delete(self, key: str) -> bool:
        """Delete key from cache"""
        if not self.enabled:
            return False
        try:
            self.redis_client.delete(key)
            logger.debug(f"Cache deleted for key: {key}")
            return True
        except Exception as e:
            logger.exception("Error deleting from cache: %s", e)
            return False

    def clear_pattern(self, pattern: str) -> int:
        """Delete all keys matching a pattern"""
        if not self.enabled:
            return 0
        try:
            keys = list(self.redis_client.scan_iter(match=pattern))
            if keys:
                deleted = self.redis_client.delete(*keys)
                logger.debug(f"Cleared {deleted} cache entries matching pattern: {pattern}")
                return deleted
            return 0
        except Exception as e:
            logger.exception("Error clearing cache pattern: %s", e)
            return 0

    def clear_all(self) -> bool:
        """Clear all cache"""
        if not self.enabled:
            return False
        try:
            self.redis_client.flushdb()
            logger.info("All cache cleared")
            return True
        except Exception as e:
            logger.exception("Error clearing all cache: %s", e)
            return False

    def get_cache_key(self, prefix: str, **kwargs) -> str:
        """Generate a cache key from prefix and parameters"""
        params = '_'.join(f"{k}_{v}" for k, v in sorted(kwargs.items()) if v is not None)
        return f"{prefix}:{params}" if params else f"{prefix}:all"


# Global cache manager instance
cache_manager = CacheManager(redis_url=os.getenv("REDIS_URL"))
