/**
 * Browser cache manager for trainer-facing API responses.
 */

export class BrowserCacheManager {
  constructor(prefix = 'trainer_cache_v1', expirationMinutes = 30) {
    this.prefix = prefix
    this.expirationMs = expirationMinutes * 60 * 1000
  }

  get(key) {
    try {
      const item = localStorage.getItem(this.getCacheKey(key))
      if (!item) return null

      const { data, timestamp } = JSON.parse(item)
      if (Date.now() - timestamp > this.expirationMs) {
        localStorage.removeItem(this.getCacheKey(key))
        return null
      }

      return data
    } catch (error) {
      console.error('Error retrieving trainer cache:', error)
      return null
    }
  }

  set(key, data) {
    try {
      localStorage.setItem(
        this.getCacheKey(key),
        JSON.stringify({ data, timestamp: Date.now() })
      )
      return true
    } catch (error) {
      console.error('Error setting trainer cache:', error)
      return false
    }
  }

  delete(key) {
    try {
      localStorage.removeItem(this.getCacheKey(key))
      return true
    } catch (error) {
      console.error('Error deleting trainer cache:', error)
      return false
    }
  }

  clearPattern(pattern) {
    try {
      const regex = new RegExp(pattern)
      const keysToDelete = []

      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index)
        if (key && regex.test(key)) {
          keysToDelete.push(key)
        }
      }

      keysToDelete.forEach((key) => localStorage.removeItem(key))
      return keysToDelete.length
    } catch (error) {
      console.error('Error clearing trainer cache pattern:', error)
      return 0
    }
  }

  getCacheKey(key) {
    return `${this.prefix}:${key}`
  }

  generateKey(prefix, params = {}) {
    const sortedParams = Object.entries(params)
      .filter(([, value]) => value != null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}_${value}`)
      .join('_')

    return sortedParams ? `${prefix}:${sortedParams}` : `${prefix}:all`
  }
}

export const cacheManager = new BrowserCacheManager()
