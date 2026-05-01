"""
Redis cache manager for caching API responses
"""
import redis
import json
import logging
from typing import Any, Optional
from datetime import timedelta

logger = logging.getLogger(__name__)

class CacheManager:
    def __init__(self, host: str = 'localhost', port: int = 6379, db: int = 0, ttl_minutes: int = 30):
        """
        Initialize Redis cache manager
        
        Args:
            host: Redis server host
            port: Redis server port
            db: Redis database number
            ttl_minutes: Default time to live for cache entries in minutes
        """
        try:
            self.redis_client = redis.Redis(host=host, port=port, db=db, decode_responses=True)
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
            if value:
                logger.debug(f"Cache hit for key: {key}")
                return json.loads(value)
            logger.debug(f"Cache miss for key: {key}")
            return None
        except Exception as e:
            logger.error(f"Error retrieving from cache: {e}")
            return None

    def set(self, key: str, value: Any, ttl: Optional[timedelta] = None) -> bool:
        """Set value in cache with TTL"""
        if not self.enabled:
            return False
        try:
            ttl = ttl or self.ttl
            self.redis_client.setex(key, ttl, json.dumps(value))
            logger.debug(f"Cache set for key: {key}")
            return True
        except Exception as e:
            logger.error(f"Error setting cache: {e}")
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
            logger.error(f"Error deleting from cache: {e}")
            return False

    def clear_pattern(self, pattern: str) -> int:
        """Delete all keys matching a pattern"""
        if not self.enabled:
            return 0
        try:
            keys = self.redis_client.keys(pattern)
            if keys:
                deleted = self.redis_client.delete(*keys)
                logger.debug(f"Cleared {deleted} cache entries matching pattern: {pattern}")
                return deleted
            return 0
        except Exception as e:
            logger.error(f"Error clearing cache pattern: {e}")
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
            logger.error(f"Error clearing all cache: {e}")
            return False

    def get_cache_key(self, prefix: str, **kwargs) -> str:
        """Generate a cache key from prefix and parameters"""
        params = '_'.join(f"{k}_{v}" for k, v in sorted(kwargs.items()) if v is not None)
        return f"{prefix}:{params}" if params else f"{prefix}:all"


# Global cache manager instance
cache_manager = CacheManager()
