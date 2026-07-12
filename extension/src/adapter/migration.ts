// migration — one-time update-in-place migration from the legacy MV2 extension.
//
// The legacy version stored profiles/settings in chrome.storage.local (same
// format the new code reads — no migration needed) but kept transient runtime
// state (currentProfileName, etc.) in localStorage, which a service worker
// cannot read. We spin up an offscreen document (public/offscreen.html) to read
// that localStorage and translate the durable bits into the new state store.
//
// SwitchySharp import is intentionally dropped (see docs/decisions.md).

import type { Storage, StorageItems } from '@switchyomega/omega-core'
import type { ChromeOptions } from './chrome_options.js'

const MIGRATION_FLAG = 'omega.migrated.v3'
const OFFSCREEN_URL = 'offscreen.html'

// Durable legacy state keys worth carrying forward.
const DURABLE_STATE_KEYS = ['currentProfileName', 'isSystemProfile', 'syncOptions'] as const

/** Pure translation: legacy localStorage state -> new state-store items. */
export function translateLegacyState(legacy: Record<string, unknown>): StorageItems {
  const out: StorageItems = {}
  for (const key of DURABLE_STATE_KEYS) {
    if (key in legacy && legacy[key] != null) out[key] = legacy[key]
  }
  return out
}

interface MigrationMessage {
  __omegaMigration?: true
  legacyState?: Record<string, unknown>
}

/**
 * Install the migration flow. On an `update` install, spins up the offscreen
 * reader; its posted message is handled here to write state, re-apply the
 * restored profile, and mark migration complete (so it never re-runs).
 */
export function installMigration(options: ChromeOptions, state: Storage): void {
  chrome.runtime.onMessage.addListener((message: MigrationMessage) => {
    if (!message?.__omegaMigration) return undefined
    const translated = translateLegacyState(message.legacyState ?? {})
    const write = Object.keys(translated).length ? state.set(translated) : Promise.resolve()
    write
      .then(() => chrome.storage.local.set({ [MIGRATION_FLAG]: true }))
      .then(() => chrome.offscreen?.closeDocument().catch(() => undefined))
      .then(() => {
        const current = translated['currentProfileName'] as string | undefined
        if (current) options.ready?.then(() => options.applyProfile(current))
      })
    return undefined
  })
}

/** Trigger the offscreen migration reader if it hasn't run yet. */
export async function runMigration(): Promise<void> {
  const done = await chrome.storage.local.get(MIGRATION_FLAG)
  if (done[MIGRATION_FLAG]) return
  if (!chrome.offscreen) {
    // Offscreen unavailable — mark done to avoid repeated attempts.
    await chrome.storage.local.set({ [MIGRATION_FLAG]: true })
    return
  }
  try {
    const has = await chrome.offscreen.hasDocument?.()
    if (!has) {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: [chrome.offscreen.Reason.LOCAL_STORAGE],
        justification: 'One-time read of legacy settings to migrate to Manifest V3.',
      })
    }
  } catch {
    await chrome.storage.local.set({ [MIGRATION_FLAG]: true })
  }
}
