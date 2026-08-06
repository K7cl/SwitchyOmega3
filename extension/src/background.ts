// SwitchyOmega 3 — background service worker (MV3).
//
// Constructs the options manager with chrome.storage-backed storage and the
// chrome.proxy implementation, and wires all lifecycle/event listeners
// synchronously at the top level (the MV3 bootstrap invariant).
//
// Storage layout: options in chrome.storage.local (unprefixed); durable runtime
// state in the same area under the `omega.state.` prefix (survives SW restarts
// and browser restarts, so the current profile can be re-applied on wake). The
// options store excludes the state prefix.

import { Log, OptionsSync } from '@switchyomega/omega-core'
import { ChromeStorage } from './adapter/chrome_storage.js'
import { ChromeOptions } from './adapter/chrome_options.js'
import { ChromeTabs } from './adapter/chrome_tabs.js'
import { SettingsProxyImpl } from './adapter/proxy/proxy_impl_settings.js'
import { installMessageRouter } from './adapter/messaging.js'
import { installContextMenus } from './adapter/context_menu.js'
import { installMigration, runMigration } from './adapter/migration.js'

const STATE_PREFIX = 'omega.state.'

const storage = new ChromeStorage('local', { excludePrefix: STATE_PREFIX })
const state = new ChromeStorage('local', { prefix: STATE_PREFIX })
// Temp rules persist in session storage: they survive service-worker restarts
// (so a per-domain temp rule isn't lost after the SW idles out) but clear on
// browser restart, matching the original's temporary-rule lifetime.
const session = chrome.storage.session
  ? new ChromeStorage('session', { prefix: STATE_PREFIX })
  : undefined

let sync: OptionsSync | undefined
if (chrome.storage.sync) {
  sync = new OptionsSync(new ChromeStorage('sync'))
  sync.transformValue = ChromeOptions.transformValueForSync
  // Syncing is opt-in; enabled later via setOptionsSync (state-driven).
  sync.enabled = false
}

const proxyImpl = new SettingsProxyImpl(Log)
proxyImpl.initAuth() // register onAuthRequired at the top level (cold-wake safe)
state.set({ proxyImplFeatures: proxyImpl.features })

const options = new ChromeOptions(null, storage, state, Log, sync, proxyImpl, session)
// Wire per-tab dynamic action icons. Must be assigned synchronously here, before
// init()'s async currentProfileChanged microtask fires, so the first icon update
// already routes through the tab controller. watch() registers tab listeners at
// the top level (cold-wake safe).
const tabs = new ChromeTabs((url) => options.actionForUrl(url))
options.setTabs(tabs)
tabs.watch()
options.setProxyNotControllable(null)

// --- external proxy-change detection (with own-change guard) ---
let externalChangeTimeout: ReturnType<typeof setTimeout> | null = null
proxyImpl.watchProxyChange((rawDetails) => {
  const details = rawDetails as { levelOfControl?: string; value?: unknown } | undefined
  if (!details) return
  const notControllableBefore = options.proxyNotControllable()
  let internal = false
  let noRevert = false
  switch (details.levelOfControl) {
    case 'controlled_by_other_extensions':
    case 'not_controllable': {
      const reason = details.levelOfControl === 'not_controllable' ? 'policy' : 'app'
      options.setProxyNotControllable(reason)
      noRevert = true
      break
    }
    default:
      options.setProxyNotControllable(null)
  }
  if (details.levelOfControl === 'controlled_by_this_extension') {
    internal = true
    // Our own change — ignore unless we were previously not in control.
    if (!notControllableBefore) return
  }

  // Debounce: Chromium fires onChange on unload just after we lose control;
  // waiting avoids clobbering currentProfileName. (Best-effort under the SW.)
  if (externalChangeTimeout != null) clearTimeout(externalChangeTimeout)
  let parsed: ReturnType<SettingsProxyImpl['parseExternalProfile']> = null
  externalChangeTimeout = setTimeout(() => {
    if (parsed) options.setExternalProfile(parsed, { noRevert, internal })
  }, 500)
  parsed = proxyImpl.parseExternalProfile(details as never, options._options)
})

// --- lifecycle + event listeners (registered synchronously) ---

chrome.runtime.onInstalled.addListener((details) => {
  Log.log('[SwitchyOmega3] onInstalled:', details.reason, details.previousVersion ?? '')
  if (details.reason === 'install') {
    state.set({ firstRun: 'new' })
  } else if (details.reason === 'update') {
    // Migrate legacy MV2 localStorage state (Phase 3.5).
    runMigration()
  }
})

chrome.runtime.onStartup.addListener(() => {
  Log.log('[SwitchyOmega3] onStartup — reconciling')
  options.ready?.then(() => {
    // The committed proxy setting persists across restarts; init() already
    // re-applied the stored profile. Re-establish SW-lifetime-scoped bits:
    options.reschedule()
    options.reassertPopup()
  })
})

chrome.action.onClicked.addListener((tab) => {
  options.ready?.then(() => options.onActionClicked(tab))
})

installMessageRouter(options, state)
installContextMenus(options, state)
installMigration(options, state)

// Debugging/E2E handle. The service-worker global scope is not reachable by web
// pages or other extensions, so this exposes no attack surface.
;(globalThis as unknown as { omega: unknown }).omega = { options, state, proxyImpl }

Log.log('[SwitchyOmega3] service worker booted')
