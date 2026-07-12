// browser_storage — a Storage backed by a Web Storage (localStorage-like)
// object. Ported from omega-target/src/browser_storage.coffee with the buggy
// remove() rewritten. Used by the Phase 3.5 migration to read legacy
// localStorage state from an offscreen document.

import { Storage, type StorageItems } from './storage.js'

export interface WebStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  clear(): void
  key(index: number): string | null
  readonly length: number
}

export class BrowserStorage extends Storage {
  constructor(
    private readonly storage: WebStorageLike,
    private readonly prefix = '',
  ) {
    super()
  }

  override get(keys?: string | string[] | StorageItems | null): Promise<StorageItems> {
    let map: StorageItems = {}
    if (typeof keys === 'string') {
      map[keys] = undefined
    } else if (Array.isArray(keys)) {
      for (const key of keys) map[key] = undefined
    } else if (keys && typeof keys === 'object') {
      map = { ...keys }
    }
    for (const key of Object.keys(map)) {
      let value: unknown
      try {
        const raw = this.storage.getItem(this.prefix + key)
        value = raw == null ? undefined : JSON.parse(raw)
      } catch {
        value = undefined
      }
      if (value != null) {
        map[key] = value
      } else if (typeof map[key] === 'undefined') {
        delete map[key]
      }
    }
    return Promise.resolve(map)
  }

  override set(items: StorageItems): Promise<StorageItems> {
    for (const key of Object.keys(items)) {
      this.storage.setItem(this.prefix + key, JSON.stringify(items[key]))
    }
    return Promise.resolve(items)
  }

  override remove(keys?: string | string[] | null): Promise<void> {
    if (keys == null) {
      if (!this.prefix) {
        this.storage.clear()
      } else {
        const toRemove: string[] = []
        for (let i = 0; i < this.storage.length; i++) {
          const k = this.storage.key(i)
          if (k != null && k.startsWith(this.prefix)) toRemove.push(k)
        }
        for (const k of toRemove) this.storage.removeItem(k)
      }
    } else if (typeof keys === 'string') {
      this.storage.removeItem(this.prefix + keys)
    } else if (Array.isArray(keys)) {
      for (const key of keys) this.storage.removeItem(this.prefix + key)
    }
    return Promise.resolve()
  }
}
