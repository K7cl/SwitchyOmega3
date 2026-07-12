import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { OptionsSync } from '../src/options_sync.js'
import { Storage, type StorageItems } from '../src/storage.js'
import { Log } from '../src/log.js'

// Replace a method with a spy that also runs `hook` after the original.
function spyWithHook<T extends object>(obj: T, method: keyof T, hook: (...a: unknown[]) => void) {
  const orig = (obj[method] as (...a: unknown[]) => unknown).bind(obj)
  const spy = vi.fn((...args: unknown[]) => {
    const r = orig(...args)
    hook(...args)
    return r
  })
  ;(obj[method] as unknown) = spy
  return spy
}

describe('OptionsSync', () => {
  beforeAll(() => {
    vi.spyOn(Log, 'log').mockImplementation(() => undefined)
  })
  afterAll(() => {
    vi.restoreAllMocks()
  })

  describe('#merge', () => {
    const sync = new OptionsSync()
    it('chooses the one with newer revision', () => {
      const newVal = { revision: '2' }
      const oldVal = { revision: '1' }
      expect(sync.merge('example', newVal, oldVal)).toBe(newVal)
    })
    it('uses oldVal when sync is disabled in newVal', () => {
      const newVal = { revision: '2', is: 'newVal', syncOptions: 'disabled' }
      const oldVal = { revision: '1', is: 'oldVal' }
      expect(sync.merge('example', newVal, oldVal)).toBe(oldVal)
    })
    it('uses oldVal when sync is disabled in oldVal', () => {
      const newVal = { revision: '2', is: 'newVal' }
      const oldVal = { revision: '1', is: 'oldVal', syncOptions: 'disabled' }
      expect(sync.merge('example', newVal, oldVal)).toBe(oldVal)
    })
    it('favors oldVal when revisions are equal', () => {
      const newVal = { revision: '1', is: 'newVal' }
      const oldVal = { revision: '1', is: 'oldVal' }
      expect(sync.merge('example', newVal, oldVal)).toBe(oldVal)
    })
    it('favors oldVal when newVal deeply equals oldVal', () => {
      const newVal = { they: 'are', the: 'same' }
      const oldVal = { they: 'are', the: 'same' }
      expect(sync.merge('example', newVal, oldVal)).toBe(oldVal)
    })
    it('chooses newVal when newVal is different', () => {
      const newVal = { they: 'are', not: 'equal' }
      const oldVal = { they: 'are', not: 'identical' }
      expect(sync.merge('example', newVal, oldVal)).toBe(newVal)
    })
  })

  describe('#requestPush', () => {
    const unlimited = new OptionsSync.TokenBucket()

    it('stores pendingChanges', () => {
      const sync = new OptionsSync()
      sync.enabled = false
      sync.requestPush({ a: 1 })
      expect(sync.pendingChanges()).toEqual({ a: 1 })
    })

    it('schedules a storage write', async () => {
      await new Promise<void>((resolve) => {
        const storage = new Storage()
        storage.set({ a: 1 })
        let setSpy: ReturnType<typeof vi.fn>
        let removeSpy: ReturnType<typeof vi.fn>
        const check = () => {
          if (setSpy.mock.calls.length === 0 || removeSpy.mock.calls.length === 0) return
          expect(setSpy).toHaveBeenCalledOnce()
          expect(setSpy).toHaveBeenCalledWith({ b: 1 })
          expect(removeSpy).toHaveBeenCalledOnce()
          expect(removeSpy).toHaveBeenCalledWith(['a'])
          resolve()
        }
        setSpy = spyWithHook(storage, 'set', check)
        removeSpy = spyWithHook(storage, 'remove', check)
        const sync = new OptionsSync(storage, unlimited)
        sync.debounce = 0
        sync.requestPush({ a: undefined, b: 1 })
      })
    })

    it('combines multiple write operations', async () => {
      await new Promise<void>((resolve) => {
        const storage = new Storage()
        storage.set({ a: 1, b: 1 })
        let setSpy: ReturnType<typeof vi.fn>
        let removeSpy: ReturnType<typeof vi.fn>
        const check = () => {
          if (setSpy.mock.calls.length === 0 || removeSpy.mock.calls.length === 0) return
          expect(setSpy).toHaveBeenCalledOnce()
          expect(setSpy).toHaveBeenCalledWith({ c: 1, d: 1 })
          expect(removeSpy).toHaveBeenCalledOnce()
          expect(removeSpy).toHaveBeenCalledWith(['a', 'b'])
          resolve()
        }
        setSpy = spyWithHook(storage, 'set', check)
        removeSpy = spyWithHook(storage, 'remove', check)
        const sync = new OptionsSync(storage, unlimited)
        sync.debounce = 0
        sync.requestPush({ a: undefined })
        sync.requestPush({ b: 2 })
        sync.requestPush({ b: undefined })
        sync.requestPush({ c: 1 })
        sync.requestPush({ d: 1 })
        sync.requestPush({ e: 1 })
        sync.requestPush({ e: undefined })
      })
    })

    it('disables syncing for profiles if quota is exceeded', async () => {
      await new Promise<void>((resolve) => {
        const options: StorageItems = { '+a': { is: 'a', oversized: true }, b: { is: 'b' } }
        const storage = new Storage()
        const setSpy = vi.fn((changes: StorageItems) => {
          for (const key of Object.keys(changes)) {
            if ((changes[key] as { oversized?: boolean }).oversized) {
              const err = new Storage.QuotaExceededError() as Error & { perItem?: boolean }
              err.perItem = true
              return Promise.reject(err)
            }
          }
          expect(setSpy).toHaveBeenCalledTimes(2)
          expect(setSpy).toHaveBeenCalledWith(options)
          expect(setSpy).toHaveBeenCalledWith({ b: { is: 'b' } })
          expect((options['+a'] as { syncOptions?: string }).syncOptions).toBe('disabled')
          expect((options['+a'] as { syncError?: { reason: string } }).syncError?.reason).toBe('quotaPerItem')
          resolve()
          return Promise.resolve(changes)
        })
        storage.set = setSpy
        const sync = new OptionsSync(storage, unlimited)
        sync.debounce = 0
        sync.requestPush(options)
      })
    })
  })

  describe('#copyTo', () => {
    it('fetches all items from remote storage', async () => {
      await new Promise<void>((resolve) => {
        const remote = new Storage()
        remote.set({ a: 1, b: 2, c: 3 })
        const storage = new Storage()
        const setSpy = spyWithHook(storage, 'set', () => {
          expect(setSpy).toHaveBeenCalledOnce()
          expect(setSpy).toHaveBeenCalledWith({ a: 1, b: 2, c: 3 })
          resolve()
        })
        const sync = new OptionsSync(remote)
        sync.copyTo(storage)
      })
    })

    it('merges with local as base', async () => {
      await new Promise<void>((resolve) => {
        const remote = new Storage()
        remote.set({ a: 1, b: 2, c: 3, d: undefined })
        const storage = new Storage()
        storage.set({ a: 1, b: 0, d: 4 })
        let setSpy: ReturnType<typeof vi.fn>
        let removeSpy: ReturnType<typeof vi.fn>
        const check = () => {
          if (setSpy.mock.calls.length === 0 || removeSpy.mock.calls.length === 0) return
          expect(setSpy).toHaveBeenCalledOnce()
          expect(setSpy).toHaveBeenCalledWith({ b: 2, c: 3 })
          expect(removeSpy).toHaveBeenCalledOnce()
          expect(removeSpy).toHaveBeenCalledWith(['d'])
          resolve()
        }
        setSpy = spyWithHook(storage, 'set', check)
        removeSpy = spyWithHook(storage, 'remove', check)
        const sync = new OptionsSync(remote)
        sync.copyTo(storage)
      })
    })
  })

  describe('#watchAndPull', () => {
    it('pulls changes into local when remote changes', async () => {
      await new Promise<void>((resolve) => {
        const remote = new Storage()
        const watchSpy = spyWithHook(remote, 'watch', (_keys, callback) => {
          const cb = callback as (c: StorageItems) => void
          setTimeout(() => {
            cb({ a: 1 })
            cb({ b: 2 })
            cb({ c: 3 })
            cb({ d: undefined })
          }, 10)
        })
        const storage = new Storage()
        storage.set({ a: 1, b: 0, d: 4 })
        let setSpy: ReturnType<typeof vi.fn>
        let removeSpy: ReturnType<typeof vi.fn>
        const check = () => {
          if (setSpy.mock.calls.length === 0 || removeSpy.mock.calls.length === 0) return
          expect(watchSpy).toHaveBeenCalledOnce()
          expect(setSpy).toHaveBeenCalledOnce()
          expect(setSpy).toHaveBeenCalledWith({ b: 2, c: 3 })
          expect(removeSpy).toHaveBeenCalledOnce()
          expect(removeSpy).toHaveBeenCalledWith(['d'])
          resolve()
        }
        setSpy = spyWithHook(storage, 'set', check)
        removeSpy = spyWithHook(storage, 'remove', check)
        const sync = new OptionsSync(remote)
        sync.pullThrottle = 0
        sync.watchAndPull(storage)
      })
    })
  })
})
