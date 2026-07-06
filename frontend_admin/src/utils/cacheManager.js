/**
 * Two-layer browser cache manager:
 *   Layer 1: In-memory Map (instant, cleared on tab close)
 *   Layer 2: localStorage (persistent across page refreshes, same origin)
 *
 * Reads always check memory first, then fall through to localStorage.
 * Writes always update both layers.
 */

export class BrowserCacheManager {
  constructor(prefix = 'app_cache_v2', expirationMinutes = 30) {
    this.prefix = prefix
    this.defaultExpirationMs = expirationMinutes * 60 * 1000
    // Layer 1: in-memory map keyed by the full localStorage key
    this._memoryCache = new Map()
  }

  normalizeExpirationMs(ttl) {
    if (typeof ttl !== 'number' || Number.isNaN(ttl) || ttl <= 0) {
      return this.defaultExpirationMs
    }

    if (ttl >= 1000) {
      return ttl
    }

    return ttl * 1000
  }

  parseItem(rawValue) {
    const parsed = JSON.parse(rawValue)
    const timestamp = Number(parsed?.timestamp || 0)
    const expiresAt = Number(parsed?.expiresAt || (timestamp + this.defaultExpirationMs))

    return {
      data: parsed?.data,
      expiresAt,
    }
  }

  getCacheKey(key) {
    return `${this.prefix}:${key}`
  }

  get(key) {
    const fullKey = this.getCacheKey(key)
    const now = Date.now()

    // --- Layer 1: memory ---
    if (this._memoryCache.has(fullKey)) {
      const entry = this._memoryCache.get(fullKey)
      if (now < entry.expiresAt) {
        return entry.data
      }
      // expired in memory — clear both layers
      this._memoryCache.delete(fullKey)
      try { localStorage.removeItem(fullKey) } catch (_) { /* noop */ }
      return null
    }

    // --- Layer 2: localStorage ---
    try {
      const raw = localStorage.getItem(fullKey)
      if (!raw) return null

      const parsed = this.parseItem(raw)
      if (now >= parsed.expiresAt) {
        localStorage.removeItem(fullKey)
        return null
      }

      // promote to memory layer for next read
      this._memoryCache.set(fullKey, { data: parsed.data, expiresAt: parsed.expiresAt })
      return parsed.data
    } catch (error) {
      console.error('Error retrieving from browser cache:', error)
      return null
    }
  }

  set(key, data, ttl) {
    const fullKey = this.getCacheKey(key)
    const timestamp = Date.now()
    const expiresAt = timestamp + this.normalizeExpirationMs(ttl)

    // --- Layer 1: memory ---
    this._memoryCache.set(fullKey, { data, expiresAt })

    // --- Layer 2: localStorage ---
    try {
      const cacheItem = { data, timestamp, expiresAt }
      localStorage.setItem(fullKey, JSON.stringify(cacheItem))
      return true
    } catch (error) {
      console.error('Error setting browser cache:', error)
      return false
    }
  }

  delete(key) {
    const fullKey = this.getCacheKey(key)
    this._memoryCache.delete(fullKey)
    try {
      localStorage.removeItem(fullKey)
      return true
    } catch (error) {
      console.error('Error deleting from browser cache:', error)
      return false
    }
  }

  clearPattern(pattern) {
    try {
      const regex = new RegExp(pattern)
      const keysToDelete = []

      // clear from memory layer
      for (const key of this._memoryCache.keys()) {
        if (regex.test(key)) {
          this._memoryCache.delete(key)
        }
      }

      // clear from localStorage
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index)
        if (key && regex.test(key)) {
          keysToDelete.push(key)
        }
      }

      keysToDelete.forEach((key) => localStorage.removeItem(key))
      return keysToDelete.length
    } catch (error) {
      console.error('Error clearing cache pattern:', error)
      return 0
    }
  }

  clearAll() {
    try {
      // clear memory layer
      for (const key of this._memoryCache.keys()) {
        if (key.startsWith(`${this.prefix}:`)) {
          this._memoryCache.delete(key)
        }
      }

      // clear localStorage
      const keys = []
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index)
        if (key?.startsWith(`${this.prefix}:`)) {
          keys.push(key)
        }
      }
      keys.forEach((key) => localStorage.removeItem(key))
      return true
    } catch (error) {
      console.error('Error clearing all cache:', error)
      return false
    }
  }

  generateKey(prefix, params = {}) {
    const sortedParams = Object.entries(params)
      .filter(([, value]) => value != null)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}_${value}`)
      .join('_')

    return sortedParams ? `${prefix}:${sortedParams}` : `${prefix}:all`
  }
}

export const cacheManager = new BrowserCacheManager()
