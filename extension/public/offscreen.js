// One-time MV3 migration helper. Runs in an offscreen document (same extension
// origin as the legacy MV2 background page), so it can read the localStorage
// state that the service worker cannot, and forwards it to the SW.
//
// Plain dependency-free script (static asset — not bundled). See
// extension/src/adapter/migration.ts for the SW side.
'use strict'
;(function () {
  var prefix = 'omega.local.'
  var data = {}
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i)
      if (key && key.indexOf(prefix) === 0) {
        var raw = localStorage.getItem(key)
        try {
          data[key.slice(prefix.length)] = raw === null ? null : JSON.parse(raw)
        } catch (e) {
          /* skip unparseable entries */
        }
      }
    }
  } catch (e) {
    /* localStorage unavailable */
  }
  chrome.runtime.sendMessage({ __omegaMigration: true, legacyState: data })
})()
