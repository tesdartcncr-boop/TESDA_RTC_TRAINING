import logging
from datetime import timedelta
import json
import os
import time
import fnmatch
from typing import Any, Optional

import redis

logger = logging.getLogger(__name__)

class CacheManager:
    def __init__(self, redis_url: str | None = None, host: str = 'localhost', port: int = 6379, db: int = 0, ttl_minutes: int = 30):
        """
        Initialize Redis cache manager with an in-memory fallback.
        
        Args:
            redis_url: Redis connection URL. If missing, cache falls back to in-memory dict.
            host: Redis server host
            port: Redis server port
            db: Redis database number
            ttl_minutes: Default time to live for cache entries in minutes
        """
        self.in_memory_cache = {}
        self.ttl = timedelta(minutes=ttl_minutes)
        self.enabled = True

        if not redis_url:
            self.redis_client = None
            logger.info("Redis cache not configured; falling back to local in-memory cache.")
            return

        try:
            self.redis_client = redis.Redis.from_url(redis_url, decode_responses=True)
            self.redis_client.ping()
            logger.info("Redis cache connected successfully")
        except Exception as e:
            logger.warning(f"Redis cache connection failed: {e}. Falling back to local in-memory cache.")
            self.redis_client = None

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        if not self.enabled:
            return None

        # If Redis is configured
        if self.redis_client is not None:
            try:
                value = self.redis_client.get(key)
                if value is not None:
                    logger.debug(f"Cache hit for key: {key}")
                    return json.loads(value)
                logger.debug(f"Cache miss for key: {key}")
                return None
            except Exception as e:
                logger.exception("Error retrieving from Redis cache: %s", e)
                return None

        # In-memory fallback
        try:
            entry = self.in_memory_cache.get(key)
            if entry is not None:
                # Check expiration
                if time.time() >= entry["expires_at"]:
                    del self.in_memory_cache[key]
                    logger.debug(f"In-memory cache expired for key: {key}")
                    return None
                logger.debug(f"In-memory cache hit for key: {key}")
                return json.loads(entry["value"])
            logger.debug(f"In-memory cache miss for key: {key}")
            return None
        except Exception as e:
            logger.exception("Error retrieving from in-memory cache: %s", e)
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

        # If Redis is configured
        if self.redis_client is not None:
            try:
                normalized_ttl = self._normalize_ttl(ttl)
                self.redis_client.setex(key, normalized_ttl, json.dumps(value))
                logger.debug("Cache set for key: %s ttl=%ss", key, int(normalized_ttl.total_seconds()))
                return True
            except Exception as e:
                logger.exception("Error setting cache in Redis: %s", e)
                return False

        # In-memory fallback
        try:
            normalized_ttl = self._normalize_ttl(ttl)
            expires_at = time.time() + normalized_ttl.total_seconds()
            self.in_memory_cache[key] = {
                "value": json.dumps(value),
                "expires_at": expires_at
            }
            logger.debug("In-memory cache set for key: %s ttl=%ss", key, int(normalized_ttl.total_seconds()))
            return True
        except Exception as e:
            logger.exception("Error setting in-memory cache: %s", e)
            return False

    def delete(self, key: str) -> bool:
        """Delete key from cache"""
        if not self.enabled:
            return False

        # If Redis is configured
        if self.redis_client is not None:
            try:
                self.redis_client.delete(key)
                logger.debug(f"Cache deleted for key: {key}")
                return True
            except Exception as e:
                logger.exception("Error deleting from Redis cache: %s", e)
                return False

        # In-memory fallback
        try:
            if key in self.in_memory_cache:
                del self.in_memory_cache[key]
                logger.debug(f"In-memory cache deleted for key: {key}")
            return True
        except Exception as e:
            logger.exception("Error deleting from in-memory cache: %s", e)
            return False

    def clear_pattern(self, pattern: str) -> int:
        """Delete all keys matching a pattern (supporting wildcard *)"""
        if not self.enabled:
            return 0

        # If Redis is configured
        if self.redis_client is not None:
            try:
                keys = list(self.redis_client.scan_iter(match=pattern))
                if keys:
                    deleted = self.redis_client.delete(*keys)
                    logger.debug(f"Cleared {deleted} Redis cache entries matching pattern: {pattern}")
                    return deleted
                return 0
            except Exception as e:
                logger.exception("Error clearing Redis cache pattern: %s", e)
                return 0

        # In-memory fallback
        try:
            keys_to_delete = [k for k in self.in_memory_cache.keys() if fnmatch.fnmatch(k, pattern)]
            for k in keys_to_delete:
                del self.in_memory_cache[k]
            logger.debug(f"Cleared {len(keys_to_delete)} in-memory cache entries matching pattern: {pattern}")
            return len(keys_to_delete)
        except Exception as e:
            logger.exception("Error clearing in-memory cache pattern: %s", e)
            return 0

    def clear_all(self) -> bool:
        """Clear all cache"""
        if not self.enabled:
            return False

        # If Redis is configured
        if self.redis_client is not None:
            try:
                self.redis_client.flushdb()
                logger.info("All Redis cache cleared")
                return True
            except Exception as e:
                logger.exception("Error clearing all Redis cache: %s", e)
                return False

        # In-memory fallback
        try:
            self.in_memory_cache.clear()
            logger.info("All in-memory cache cleared")
            return True
        except Exception as e:
            logger.exception("Error clearing all in-memory cache: %s", e)
            return False

    def get_cache_key(self, prefix: str, **kwargs) -> str:
        """Generate a cache key from prefix and parameters"""
        params = '_'.join(f"{k}_{v}" for k, v in sorted(kwargs.items()) if v is not None)
        return f"{prefix}:{params}" if params else f"{prefix}:all"


# Global cache manager instance
cache_manager = CacheManager(redis_url=os.getenv("REDIS_URL"))
