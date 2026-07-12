// chrome_storage — a Storage backed by chrome.storage areas (MV3 native
// promises). Ported from omega-target-chromium-extension/src/module/storage.coffee.
//
// Prefix support lets options and durable state share chrome.storage.local
// without colliding: options use no prefix; state uses `omega.state.`, and the
// options store excludes that prefix from get(null)/watch(null).

import { Storage, type StorageItems, type WatchCallback } from '@switchyomega/omega-core'

export interface ChromeStorageOptions {
  /** Transparent key prefix applied to all reads/writes. */
  prefix?: string
  /** On get(null)/watch(null), skip keys starting with this prefix. */
  excludePrefix?: string
}

interface StorageErrorFlags {
  perItem?: boolean
  maxItems?: boolean
  perHour?: boolean
  perMinute?: boolean
  sustained?: number
}

function parseStorageErrors(err: unknown): never {
  const message = (err as Error | undefined)?.message
  if (message) {
    let mapped: (Error & StorageErrorFlags) | undefined
    if (message.indexOf('QUOTA_BYTES_PER_ITEM') >= 0) {
      mapped = new Storage.QuotaExceededError()
      mapped.perItem = true
    } else if (message.indexOf('QUOTA_BYTES') >= 0) {
      mapped = new Storage.QuotaExceededError()
    } else if (message.indexOf('MAX_ITEMS') >= 0) {
      mapped = new Storage.QuotaExceededError()
      mapped.maxItems = true
    } else if (message.indexOf('MAX_WRITE_OPERATIONS_') >= 0) {
      mapped = new Storage.RateLimitExceededError()
      if (message.indexOf('MAX_WRITE_OPERATIONS_PER_HOUR') >= 0) mapped.perHour = true
      else if (message.indexOf('MAX_WRITE_OPERATIONS_PER_MINUTE') >= 0) mapped.perMinute = true
    } else if (message.indexOf('MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE') >= 0) {
      mapped = new Storage.RateLimitExceededError()
      mapped.perMinute = true
      mapped.sustained = 10
    } else if (
      message.indexOf('is not available') >= 0 ||
      message.indexOf('Please set webextensions.storage.sync.enabled to true') >= 0
    ) {
      mapped = new Storage.StorageUnavailableError()
    }
    if (mapped) throw mapped
  }
  throw err
}

interface Watcher {
  keys: Record<string, true> | null
  callback: WatchCallback
}

export class ChromeStorage extends Storage {
  private readonly areaName: chrome.storage.AreaName
  private readonly area: chrome.storage.StorageArea
  private readonly prefix: string
  private readonly excludePrefix?: string

  // One shared onChanged listener fans out to all ChromeStorage watchers.
  private static watchers: Partial<Record<chrome.storage.AreaName, Set<Watcher & { prefix: string; excludePrefix?: string }>>> = {}
  private static listenerInstalled = false

  constructor(areaName: chrome.storage.AreaName, opts?: ChromeStorageOptions) {
    super()
    this.areaName = areaName
    this.area = chrome.storage[areaName]
    this.prefix = opts?.prefix ?? ''
    this.excludePrefix = opts?.excludePrefix
  }

  private keep(rawKey: string): boolean {
    if (this.excludePrefix && rawKey.startsWith(this.excludePrefix)) return false
    if (this.prefix) return rawKey.startsWith(this.prefix)
    return true
  }
  private strip(rawKey: string): string {
    return this.prefix ? rawKey.slice(this.prefix.length) : rawKey
  }

  override get(keys?: string | string[] | StorageItems | null): Promise<StorageItems> {
    if (keys == null) {
      return this.area
        .get(null)
        .then((all) => {
          const map: StorageItems = {}
          for (const rawKey of Object.keys(all)) {
            if (this.keep(rawKey)) map[this.strip(rawKey)] = all[rawKey]
          }
          return map
        })
        .catch(parseStorageErrors)
    }
    let query: string | string[] | Record<string, unknown>
    let strip = false
    if (typeof keys === 'string') {
      query = this.prefix + keys
      strip = !!this.prefix
    } else if (Array.isArray(keys)) {
      query = keys.map((k) => this.prefix + k)
      strip = !!this.prefix
    } else {
      // defaults object — chrome applies defaults for missing keys
      const q: Record<string, unknown> = {}
      for (const k of Object.keys(keys)) q[this.prefix + k] = keys[k]
      query = q
      strip = !!this.prefix
    }
    return this.area
      .get(query)
      .then((res) => {
        if (!strip) return res as StorageItems
        const map: StorageItems = {}
        for (const rawKey of Object.keys(res)) map[this.strip(rawKey)] = res[rawKey]
        return map
      })
      .catch(parseStorageErrors)
  }

  override set(items: StorageItems): Promise<StorageItems> {
    if (Object.keys(items).length === 0) return Promise.resolve({})
    const toSet: StorageItems = {}
    for (const k of Object.keys(items)) toSet[this.prefix + k] = items[k]
    return this.area
      .set(toSet)
      .then(() => items)
      .catch(parseStorageErrors)
  }

  override remove(keys?: string | string[] | null): Promise<void> {
    if (keys == null) {
      if (!this.prefix) return this.area.clear().catch(parseStorageErrors)
      return this.area
        .get(null)
        .then((all) => this.area.remove(Object.keys(all).filter((k) => this.keep(k))))
        .catch(parseStorageErrors)
    }
    if (Array.isArray(keys)) {
      if (keys.length === 0) return Promise.resolve()
      return this.area.remove(keys.map((k) => this.prefix + k)).catch(parseStorageErrors)
    }
    return this.area.remove(this.prefix + keys).catch(parseStorageErrors)
  }

  override watch(keys: string | string[] | null, callback: WatchCallback): () => void {
    const set = (ChromeStorage.watchers[this.areaName] ??= new Set())
    let keyMap: Record<string, true> | null = null
    if (Array.isArray(keys)) {
      keyMap = {}
      for (const k of keys) keyMap[this.prefix + k] = true
    } else if (typeof keys === 'string') {
      keyMap = { [this.prefix + keys]: true }
    }
    const watcher = { keys: keyMap, callback, prefix: this.prefix, excludePrefix: this.excludePrefix }
    set.add(watcher)
    if (!ChromeStorage.listenerInstalled) {
      chrome.storage.onChanged.addListener(ChromeStorage.onChanged)
      ChromeStorage.listenerInstalled = true
    }
    return () => set.delete(watcher)
  }

  private static onChanged(
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: chrome.storage.AreaName,
  ): void {
    const set = ChromeStorage.watchers[areaName]
    if (!set) return
    for (const watcher of set) {
      // Build this watcher's stripped/filtered view of the changes.
      let match = watcher.keys == null
      const map: StorageItems = {}
      for (const rawKey of Object.keys(changes)) {
        if (watcher.excludePrefix && rawKey.startsWith(watcher.excludePrefix)) continue
        if (watcher.prefix && !rawKey.startsWith(watcher.prefix)) continue
        const key = watcher.prefix ? rawKey.slice(watcher.prefix.length) : rawKey
        map[key] = changes[rawKey].newValue
        if (watcher.keys?.[rawKey]) match = true
      }
      if (match && Object.keys(map).length > 0) watcher.callback(map)
    }
  }
}
