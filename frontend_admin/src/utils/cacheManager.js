/**
 * Browser cache manager for storing API responses in localStorage
 */

export class BrowserCacheManager {
  constructor(prefix = 'app_cache', expirationMinutes = 30) {
    this.prefix = prefix
    this.expirationMs = expirationMinutes * 60 * 1000
  }

  /**
   * Get value from browser cache
   */
  get(key) {
    try {
      const item = localStorage.getItem(this.getCacheKey(key))
      if (!item) return null

      const { data, timestamp } = JSON.parse(item)
      
      // Check if cache has expired
      if (Date.now() - timestamp > this.expirationMs) {
        localStorage.removeItem(this.getCacheKey(key))
        return null
      }

      return data
    } catch (error) {
      console.error('Error retrieving from browser cache:', error)
      return null
    }
  }

  /**
   * Set value in browser cache
   */
  set(key, data) {
    try {
      const cacheItem = {
        data,
        timestamp: Date.now()
      }
      localStorage.setItem(this.getCacheKey(key), JSON.stringify(cacheItem))
      return true
    } catch (error) {
      console.error('Error setting browser cache:', error)
      return false
    }
  }

  /**
   * Delete key from browser cache
   */
  delete(key) {
    try {
      localStorage.removeItem(this.getCacheKey(key))
      return true
    } catch (error) {
      console.error('Error deleting from browser cache:', error)
      return false
    }
  }

  /**
   * Clear all cache entries matching a pattern
   */
  clearPattern(pattern) {
    try {
      const regex = new RegExp(pattern)
      const keysToDelete = []
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (regex.test(key)) {
          keysToDelete.push(key)
        }
      }

      keysToDelete.forEach(key => localStorage.removeItem(key))
      return keysToDelete.length
    } catch (error) {
      console.error('Error clearing cache pattern:', error)
      return 0
    }
  }

  /**
   * Clear all cache
   */
  clearAll() {
    try {
      const keys = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key.startsWith(`${this.prefix}:`)) {
          keys.push(key)
        }
      }
      keys.forEach(key => localStorage.removeItem(key))
      return true
    } catch (error) {
      console.error('Error clearing all cache:', error)
      return false
    }
  }

  /**
   * Generate cache key
   */
  getCacheKey(key) {
    return `${this.prefix}:${key}`
  }

  /**
   * Generate cache key from prefix and parameters
   */
  generateKey(prefix, params = {}) {
    const sortedParams = Object.entries(params)
      .filter(([, v]) => v != null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}_${v}`)
      .join('_')
    
    return sortedParams ? `${prefix}:${sortedParams}` : `${prefix}:all`
  }
}

// Export singleton instance
export const cacheManager = new BrowserCacheManager()
