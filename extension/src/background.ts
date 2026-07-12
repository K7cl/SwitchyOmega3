// SwitchyOmega 3 — background service worker (MV3).
//
// Phase 0: hello-world. Event listeners are registered SYNCHRONOUSLY at the top
// level (the MV3 bootstrap invariant) so a respawned worker never misses an
// event. Later phases add: proxy application (ProxyImplSettings), storage
// rehydration on wake, onStartup reconciliation, alarms, and proxy auth.

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[SwitchyOmega3] onInstalled:', details.reason, details.previousVersion ?? '')
})

chrome.runtime.onStartup.addListener(() => {
  console.log('[SwitchyOmega3] onStartup — browser launched; will reconcile proxy state here')
})

console.log('[SwitchyOmega3] service worker booted at', new Date().toISOString())
