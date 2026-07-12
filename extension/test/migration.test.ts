import { describe, it, expect } from 'vitest'
import { translateLegacyState } from '../src/adapter/migration.js'

describe('translateLegacyState', () => {
  it('carries forward durable legacy state keys', () => {
    expect(
      translateLegacyState({
        currentProfileName: 'proxy',
        isSystemProfile: false,
        syncOptions: 'sync',
        inspectUrl: 'http://x/', // dropped
        firstRun: 'upgrade', // dropped
        log: 'lots of text', // dropped
      }),
    ).toEqual({ currentProfileName: 'proxy', isSystemProfile: false, syncOptions: 'sync' })
  })

  it('skips null/absent values', () => {
    expect(translateLegacyState({ currentProfileName: null, isSystemProfile: true })).toEqual({
      isSystemProfile: true,
    })
    expect(translateLegacyState({})).toEqual({})
  })
})
