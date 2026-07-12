// storage — abstract key/value storage with an in-memory default implementation
// and change-set computation. Ported from omega-target/src/storage.coffee
// (bluebird -> native promises). Browser-specific subclasses (chrome.storage)
// override get/set/remove/watch.

import { Log } from './log.js'

export type StorageItems = Record<string, unknown>

export interface WriteOperations {
  set: StorageItems
  remove: string[]
}

export type MergeFn = (key: string, newVal: unknown, oldVal: unknown) => unknown

export interface ChangesInput {
  changes: StorageItems
  base?: StorageItems
  merge?: MergeFn
}

export type WatchCallback = (changes: StorageItems | null) => void

export class Storage {
  /** Operations rejected due to rate limiting reject with this in subclasses. */
  static RateLimitExceededError = class RateLimitExceededError extends Error {}
  /** Operations rejected due to quota reject with this in subclasses. */
  static QuotaExceededError = class QuotaExceededError extends Error {}
  /** Fatal: the storage is unavailable in this environment. */
  static StorageUnavailableError = class StorageUnavailableError extends Error {}

  protected _items?: StorageItems

  /** Compute the write operations needed to replay `changes` onto the storage. */
  static operationsForChanges(
    changes: StorageItems,
    { base, merge }: { base?: StorageItems; merge?: MergeFn } = {},
  ): WriteOperations {
    const set: StorageItems = {}
    const remove: string[] = []
    for (const key of Object.keys(changes)) {
      let newVal = changes[key]
      const oldVal = base != null ? base[key] : newVal
      if (merge) newVal = merge(key, newVal, oldVal)
      if (base != null && newVal === oldVal) continue
      if (typeof newVal === 'undefined') {
        if (typeof oldVal !== 'undefined' || base == null) remove.push(key)
      } else {
        set[key] = newVal
      }
    }
    return { set, remove }
  }

  get(keys?: string | string[] | StorageItems | null): Promise<StorageItems> {
    Log.method('Storage#get', this, [keys])
    if (!this._items) return Promise.resolve({})
    const items = this._items
    const map: StorageItems = {}
    if (keys == null) {
      for (const key of Object.keys(items)) map[key] = items[key]
    } else if (typeof keys === 'string') {
      map[keys] = items[keys]
    } else if (Array.isArray(keys)) {
      for (const key of keys) map[key] = items[key]
    } else {
      for (const key of Object.keys(keys)) map[key] = items[key] ?? keys[key]
    }
    return Promise.resolve(map)
  }

  set(items: StorageItems): Promise<StorageItems> {
    Log.method('Storage#set', this, [items])
    this._items ??= {}
    for (const key of Object.keys(items)) this._items[key] = items[key]
    return Promise.resolve(items)
  }

  remove(keys?: string | string[] | null): Promise<void> {
    Log.method('Storage#remove', this, [keys])
    if (this._items) {
      if (keys == null) {
        this._items = {}
      } else if (Array.isArray(keys)) {
        for (const key of keys) delete this._items[key]
      } else {
        delete this._items[keys]
      }
    }
    return Promise.resolve()
  }

  watch(_keys: string | string[] | null, _callback: WatchCallback): () => void {
    Log.method('Storage#watch', this, [_keys])
    return () => null
  }

  apply(operations: WriteOperations | ChangesInput): Promise<WriteOperations> {
    let ops: WriteOperations
    if ('changes' in operations) {
      ops = Storage.operationsForChanges(operations.changes, operations)
    } else {
      ops = operations
    }
    return this.set(ops.set)
      .then(() => this.remove(ops.remove))
      .then(() => ops)
  }
}
