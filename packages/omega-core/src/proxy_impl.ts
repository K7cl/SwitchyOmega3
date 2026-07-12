import type { Profile } from '@switchyomega/omega-pac'
import type { OmegaOptions } from './types.js'

/**
 * Browser-specific proxy application. The base Options class calls into this to
 * actually set the browser proxy; the Chrome adapter (Phase 3) implements it
 * with chrome.proxy.
 *
 * @param profile The profile whose PAC/config should be applied (may be the
 *   temp switch profile when temp rules are active).
 * @param meta The user-facing "current" profile driving display/state.
 * @param options The full option set (for resolving referenced profiles).
 */
export interface ProxyImpl {
  applyProfile(profile: Profile, meta: Profile, options: OmegaOptions): Promise<unknown>
  /** Optional capability flags surfaced by the implementation. */
  readonly features?: readonly string[]
}
