import { describe, it, expect } from 'vitest'
import { OMEGA_PAC_VERSION } from '../src/index.js'

// Phase 0 smoke test — proves the vitest runner + TS ESM resolution work.
// Replaced in Phase 1 by the behavioral PAC contract (eval generated PAC +
// FindProxyForURL result matrix + /*OmegaProfile*/ header round-trip).
describe('omega-pac package', () => {
  it('exposes a version marker', () => {
    expect(OMEGA_PAC_VERSION).toBe('3.0.0')
  })
})
