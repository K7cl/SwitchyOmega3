// options_sync — syncs options to a remote Storage with debounced, rate-limited,
// conflict-merging writes. Ported from omega-target/src/options_sync.coffee
// (bluebird -> native promises; limiter -> ./token_bucket).

import { create } from 'jsondiffpatch'
import { Revision } from '@switchyomega/omega-pac'
import { Storage, type StorageItems, type WriteOperations } from './storage.js'
import { Log } from './log.js'
import { TokenBucket } from './token_bucket.js'

// Object hashing keeps array-diffing stable. Text diffing is disabled by
// omitting the diffMatchPatch option (jsondiffpatch only text-diffs when one is
// provided) — matching the legacy intent of textDiff.minLength = Infinity.
const mergeDiffer = create({
  objectHash: (obj: object) => JSON.stringify(obj),
})

interface Syncable {
  syncOptions?: string
  revision?: string
  syncError?: { reason: string }
}

export class OptionsSync {
  static TokenBucket = TokenBucket

  /** Debounce (ms) for requestPush scheduling. */
  debounce = 1000
  /** Throttle (ms) for watchAndPull. */
  pullThrottle = 1000
  /** Whether syncing is enabled. */
  enabled = true

  readonly storage: Storage
  private _bucket: TokenBucket
  private _pending: StorageItems = {}
  private _timeout: ReturnType<typeof setTimeout> | null = null
  private _waiting = false

  constructor(storage?: Storage, bucket?: TokenBucket) {
    this.storage = storage ?? new Storage()
    this._bucket = bucket ?? new TokenBucket(10, 10, 'minute', null)
  }

  /** Transform a value before syncing (identity by default; overridable). */
  transformValue(value: unknown, _key?: string): unknown {
    return value
  }

  /**
   * Merge new and old values of a key:
   * 1. oldVal if syncOptions is 'disabled' in either.
   * 2. oldVal if its revision is newer than or equal to newVal's.
   * 3. oldVal if it deeply equals newVal.
   * 4. otherwise newVal.
   */
  merge(_key: string, newVal: unknown, oldVal: unknown): unknown {
    if (newVal === oldVal) return oldVal
    const nv = newVal as Syncable | undefined
    const ov = oldVal as Syncable | undefined
    if (ov?.syncOptions === 'disabled' || nv?.syncOptions === 'disabled') return oldVal
    if (ov?.revision != null && nv?.revision != null) {
      if (Revision.compare(ov.revision, nv.revision) >= 0) return oldVal
    }
    if (mergeDiffer.diff(oldVal, newVal) == null) return oldVal
    return newVal
  }

  /** Cache changes and schedule a debounced push if enabled. */
  requestPush(changes: StorageItems): void {
    if (this._timeout != null) clearTimeout(this._timeout)
    for (const key of Object.keys(changes)) {
      let value = changes[key]
      if (typeof value !== 'undefined') {
        value = this.transformValue(value, key)
        if (typeof value === 'undefined') continue
      }
      this._pending[key] = value
    }
    if (!this.enabled) return
    this._timeout = setTimeout(() => this._doPush(), this.debounce)
  }

  pendingChanges(): StorageItems {
    return this._pending
  }

  private _doPush(): void {
    this._timeout = null
    if (this._waiting) return
    this._waiting = true
    this._bucket.removeTokens(1, () => {
      this.storage
        .get(null)
        .then((base) => {
          const changes = this._pending
          this._pending = {}
          this._waiting = false
          return Storage.operationsForChanges(changes, { base, merge: (k, n, o) => this.merge(k, n, o) })
        })
        .then(({ set, remove }: WriteOperations) => {
          const doSet =
            Object.keys(set).length === 0
              ? Promise.resolve(0)
              : (Log.log('OptionsSync::set', set), this.storage.set(set).then(() => 1))
          return doSet
            .then((cost) => {
              set = {}
              if (remove.length > 0) {
                if (this._bucket.tryRemoveTokens(cost)) {
                  Log.log('OptionsSync::remove', remove)
                  return this.storage.remove(remove)
                }
                return Promise.reject('bucket')
              }
              return undefined
            })
            .catch((e: unknown) => {
              // Re-submit the changes for syncing at lower priority.
              for (const key of Object.keys(set)) {
                if (!(key in this._pending)) this._pending[key] = set[key]
              }
              for (const key of remove) {
                if (!(key in this._pending)) this._pending[key] = undefined
              }

              if (e === 'bucket') {
                this._doPush()
              } else if (e instanceof Storage.RateLimitExceededError) {
                Log.log('OptionsSync::rateLimitExceeded')
                this._bucket.clear()
                this.requestPush({})
              } else if (e instanceof Storage.QuotaExceededError) {
                let valuesAffected = 0
                for (const key of Object.keys(set)) {
                  const value = set[key] as Syncable
                  if (key[0] === '+' && value.syncOptions !== 'disabled') {
                    value.syncOptions = 'disabled'
                    value.syncError = { reason: 'quotaPerItem' }
                    valuesAffected++
                  }
                }
                if (valuesAffected > 0) {
                  this.requestPush({})
                } else {
                  this._pending = {}
                }
              } else {
                return Promise.reject(e)
              }
              return undefined
            })
        })
    })
  }

  private _logOperations(text: string, operations: WriteOperations): void {
    if (Object.keys(operations.set).length) Log.log(text + '::set', operations.set)
    if (operations.remove.length) Log.log(text + '::remove', operations.remove)
  }

  /** Pull all remote items into the local storage (merging on local as base). */
  copyTo(local: Storage): Promise<void> {
    return Promise.all([local.get(null), this.storage.get(null)]).then(([base, changes]) => {
      // NOTE: the legacy loop over base-keys-missing-from-changes was a no-op
      // (an operator-precedence bug made its guard always false). Preserved as a
      // no-op to keep sync behavior identical.
      return local
        .apply({ changes, base, merge: (k, n, o) => this.merge(k, n, o) })
        .then((operations) => this._logOperations('OptionsSync::copyTo', operations))
    })
  }

  /** Watch remote storage and pull changes into local (throttled). */
  watchAndPull(local: Storage): () => void {
    let pullScheduled: ReturnType<typeof setTimeout> | null = null
    let pull: StorageItems = {}
    const doPull = (): Promise<WriteOperations> =>
      local
        .get(null)
        .then((base) => {
          const changes = pull
          pull = {}
          pullScheduled = null
          return Storage.operationsForChanges(changes, { base, merge: (k, n, o) => this.merge(k, n, o) })
        })
        .then((operations) => {
          this._logOperations('OptionsSync::pull', operations)
          return local.apply(operations)
        })

    return this.storage.watch(null, (changes) => {
      if (!changes) return
      for (const key of Object.keys(changes)) pull[key] = changes[key]
      if (pullScheduled != null) return
      pullScheduled = setTimeout(doPull, this.pullThrottle)
    })
  }
}
