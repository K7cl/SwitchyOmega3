import { defineManifest } from '@crxjs/vite-plugin'

// Hand-authored MV3 manifest (per docs/decisions.md: Vite + @crxjs, real
// auditable manifest). Lean permission set — all optional features trimmed.
//
// Firefox is intentionally unsupported (Chrome/Chromium only).
export default defineManifest({
  manifest_version: 3,
  name: '__MSG_manifest_app_name__',
  version: '3.0.0',
  default_locale: 'en',
  description: '__MSG_manifest_app_description__',
  // Feature floor: chrome.offscreen (109) is the highest hard requirement
  // (used by the update-in-place migration). 116 gives MV3 SW stability margin.
  minimum_chrome_version: '116',
  icons: {
    16: 'img/icons/omega-action-16.png',
    24: 'img/icons/omega-action-24.png',
    32: 'img/icons/omega-action-32.png',
    48: 'img/icons/omega-48.png',
    64: 'img/icons/omega-64.png',
    128: 'img/icons/omega-128.png',
  },
  action: {
    default_icon: {
      16: 'img/icons/omega-action-16.png',
      19: 'img/icons/omega-action-19.png',
      24: 'img/icons/omega-action-24.png',
      32: 'img/icons/omega-action-32.png',
    },
    default_title: '__MSG_manifest_icon_default_title__',
    // Phase 0: static popup. Phase 6 switches to runtime chrome.action.setPopup
    // so quick-switch "cycle on click" mode can fire action.onClicked instead.
    default_popup: 'src/entries/popup/index.html',
  },
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  options_ui: {
    page: 'src/entries/options/index.html',
    open_in_tab: true,
  },
  commands: {
    _execute_action: {
      suggested_key: { default: 'Alt+Shift+O' },
    },
  },
  // Lean set. Dropped vs full-feature: `scripting` (element inspector cut).
  // `webRequest` + `webRequestAuthProvider` are kept for proxy authentication.
  permissions: [
    'proxy',
    'storage',
    'unlimitedStorage',
    'alarms',
    'tabs',
    'contextMenus',
    'webRequest',
    'webRequestAuthProvider',
    'offscreen',
  ],
  // Required by onAuthRequired to answer proxy auth challenges across hosts.
  host_permissions: ['<all_urls>'],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'",
  },
})
