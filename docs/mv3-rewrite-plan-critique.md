Reviewed the plan against the dossier's UI checklist, the ZeroOmega MV3 techniques, and the MV3 platform notes. It is a strong plan, but it is optimistic in several load-bearing places. Concrete gaps, most severe first:

## Critical (architecture / correctness)

**1. User-data migration is architecturally unsolved, and there is no phase for it.**
The dossier is explicit that the old `_state` (currentProfileName, proxyNotControllable, inspectUrl, firstRun, `config`, logs) lived in `localStorage` via `BrowserStorage`, and that a service worker **cannot read `localStorage` at all**. The plan (a) only lists migration as open-question #3, (b) has no roadmap phase for it, and (c) explicitly rejects offscreen documents and content scripts — which are the *only* MV3 contexts with DOM access to the old `localStorage`. So on an in-place update, any data that lived solely in `localStorage` is unreadable from the SW and silently lost.
*Fix:* Add an explicit "Phase 3.5 — upgrade/migration" with a concrete mechanism: on `onInstalled{reason:'update'}`, open a one-time hidden migration context that has DOM (`chrome.offscreen` document, or a migration tab/options page) to read legacy `localStorage`, translate it into `chrome.storage.local`/`session`, extend the `schemaVersion` upgrade chain (v2→v3), and verify against a snapshot of a real pre-upgrade profile. Decide "new listing vs. update-in-place + preserve `key`" *before* Phase 0, because it changes whether migration is even needed.

**2. Quick-switch "cycle on toolbar click" is incompatible with a statically-set `default_popup`.**
The manifest hard-codes `action.default_popup = "popup.html"` and Phase 0/§4.1 also registers `chrome.action.onClicked`. Per the dossier's own MV3 note, `onClicked` **does not fire when a popup is set**. SwitchyOmega's quick-switch cycles profiles on icon click precisely by *not* having a popup — the old `setQuickSwitch` override toggles `setPopup('')` dynamically. As written, cycle-on-click can never fire.
*Fix:* Do not set `default_popup` statically. Manage it at runtime: call `chrome.action.setPopup({popup:''})` when quick-switch cycle mode is enabled and `setPopup({popup:'popup.html'})` otherwise, re-asserting on every `onStartup`/wake from stored settings.

**3. Proxy-auth on a cold SW wake has an unresolved sync-vs-async race the plan hand-waves.**
`onAuthRequired` in `['blocking']` form (the dossier shows ZeroOmega returns `{authCredentials}` synchronously) must produce credentials *at handler-invocation time*. But after a SW respawn, in-memory `_options` is empty and credentials live in `chrome.storage` (async). A synchronous blocking handler cannot `await` a storage read. The preflight-fetch trick only helps *while the SW is already awake at `applyProfile` time*; it does nothing for the "SW died, proxied request arrives cold, `onAuthRequired` fires before rehydration completes" case — which is the exact scenario keepalive would have covered and which the plan declines to run.
*Fix:* Confirm whether Chrome MV3 permits async (`'asyncBlocking'` / Promise-returning) `onAuthRequired` for non-enterprise extensions; if not, keep a synchronously-readable credential cache (e.g. mirror only the credentials into a module global rehydrated at top-of-file from `storage.session` via a blocking-friendly path, or accept a task-scoped keepalive during any auth-bearing profile). Treat this as a spike in Phase 4 with a documented fallback UX, not an "open question."

**4. The PAC-emitter acceptance gate is self-contradictory ("byte-for-byte against the ported tests").**
The dossier states the existing tests assert **exact `print_to_string()` output** produced by uglify-js. A brand-new hand-written emitter will emit valid-but-different bytes (whitespace, mangling, node ordering), so it cannot satisfy the old string-equality assertions while also replacing uglify-js. The plan simultaneously says "drop uglify-js" and "emitter output must satisfy [the exact-output] tests." Those cannot both hold.
*Fix:* Explicitly convert the contract from string-equality to **behavioral**: `eval` the generated PAC in the test runner and assert `FindProxyForURL` returns the correct result across a matrix of URLs/profiles (plus the `/*OmegaProfile*name*rev*/` header round-trip through `parseExternalProfile`). Rewrite the exact-string expectations; budget for that in Phase 1 and stop calling it "byte-for-byte."

## High (dropped features)

**5. The element-inspector feature is effectively dropped — it needs a content script / `chrome.scripting`, which the plan forbids.**
The dossier documents `setInspect`, `inspect.coffee`, the "show inspect menu" UI setting, and `inspectUrl` state. Inspecting a page element to build a rule requires injecting into the page. The plan declares "**no content scripts**… omit `web_accessible_resources` entirely" and does not request the `scripting` permission. The inspect UI toggle is in the §5 checklist but the actual capability has no delivery mechanism.
*Fix:* Either add `scripting` + a programmatic content-script injection path (and the needed host permission) for the inspector, or explicitly scope-cut the inspect feature with sign-off — but don't leave the toggle in the UI with no backend.

**6. The external-messaging API (`onConnectExternal`) is silently omitted.**
The dossier calls out `external_api.coffee`, `chrome.runtime.onConnectExternal`, `options.externalApi`, and a `knownExts` allowlist — this lets other extensions drive SwitchyOmega and underpins SwitchySharp migration. The plan never mentions it anywhere (not in adapter, not in §5, not in risks).
*Fix:* Decide explicitly whether the external API is preserved (it's part of "100% feature set"); if kept, add `externalizable_message` handling and the allowlist to the adapter + messaging phase; if dropped, document it as a deliberate parity break.

**7. SwitchySharp legacy import is left as an open question, not committed.**
`upgrade()`'s SwitchySharp import path and `switchysharp.coffee` (5s polling connect) are real import features. Open-question #3 mentions it in passing but no phase owns it, and its polling/`onConnectExternal` dependency ties it to #6.
*Fix:* Explicitly keep or cut, and if kept, note that the 5s `setInterval` poller must become event/alarm-driven under the SW.

## Medium (platform correctness / ordering)

**8. Manifest uses `__MSG_…__` placeholders + `default_locale:"en"` from Phase 0, but the i18n build is Phase 7 — the extension won't load in between.**
Chrome refuses to load an extension whose manifest references `__MSG_*__` with `default_locale` set but no `_locales/en/messages.json`. Phases 0–6 would fail to load unpacked as specified.
*Fix:* Build at least a minimal `_locales/en/messages.json` in Phase 0 (or move a stub of the `omega-i18n` en-only conversion to Phase 0); keep the full 28-locale wiring in Phase 7.

**9. Alarms are assumed persistent, but the dossier's own MV3 notes warn `persistAcrossSessions` is unreliable pre-Chrome 150.**
Profile auto-update and sync-check run on `chrome.alarms`. If alarms don't survive a browser restart on the target floor, auto-update and sync silently stop with no error.
*Fix:* Re-create/verify all alarms in `onStartup` (and `onInstalled`) from stored settings, rather than assuming create-once persistence.

**10. Popup startup latency regression is understated.**
The vanilla popup existed specifically for fast open. A Vue popup now requires: SW wake → async `chrome.storage` rehydration → message round-trip → framework boot, all before the profile menu renders. That is strictly slower than the old persistent-page + vanilla popup, and worst-case the SW is cold every open.
*Fix:* Render the popup shell + last-known profile list from `storage.session`/`local` synchronously-ish before the SW round-trip resolves; treat popup TTI as an explicit perf budget in Phase 6, and keep the unify-to-one-popup decision (open #6) gated on hitting it.

**11. Incognito proxy control is not addressed at all.**
`chrome.proxy.settings` has separate `incognito_persistent`/`incognito_session_only` scopes; the plan only ever sets `scope:'regular'`. If the extension is enabled in incognito, proxy behavior there is undefined by the plan.
*Fix:* Decide incognito behavior (mirror regular scope, or explicitly unsupported) and handle `chrome.extension.isAllowedIncognitoAccess()` + the incognito scope in `applyProfile`.

## Lower (dependency / hygiene)

**12. WXT is a pre-1.0 (0.20.x) core build dependency for a "security-first, stable" rewrite — and its generated manifest must be proven to equal the hand-written §4.6 target.**
The plan both hand-writes an exact manifest and delegates manifest generation to WXT; these can drift (WXT owns CSP, permissions, `minimum_chrome_version` via config). A 0.x tool owning the build is a real supply-chain/stability risk the plan doesn't weigh against the leaner `@crxjs/vite-plugin` (which keeps a real `manifest.json`).
*Fix:* Add a CI assertion that the built manifest byte-matches the intended §4.6 manifest (esp. CSP + permissions), pin WXT exactly, and record the WXT-vs-crxjs tradeoff explicitly given the pre-1.0 status.

**13. `minimum_chrome_version:"116"` is arbitrary and stricter than needed, cutting users for no stated reason.**
ZeroOmega ships `"88"`; `storage.session` from SW is ~102+, `webRequestAuthProvider` is older. 116 is a guess flagged only in open questions.
*Fix:* Pin the floor to the actual max of the features used (verify `webRequestAuthProvider` + `storage.session`-from-SW), not a round number.

**14. The `chrome.proxy.settings.onChange` 500ms debounce relies on `setTimeout`, which the plan itself says is lossy under SW suspension — but losing it reintroduces exactly the `currentProfileName` corruption the debounce prevents.**
The plan waves this away as "best-effort," yet the debounced case is a correctness guard (Chromium fires `onChange` on unload after control is lost), not cosmetic.
*Fix:* Persist a short-lived "expecting-own-change" marker in `storage.session` so a respawned SW can still ignore the spurious post-unload `onChange`, rather than depending on an in-flight `setTimeout`.

Net: the PAC/no-eval/CSP story is fundamentally correct (PAC is data to `chrome.proxy`, runs in Chrome's resolver sandbox, never `eval`'d in-extension) and the "proxy setting persists across SW restarts" claim is right. The real soft spots are (1) migration, (2) quick-switch/popup toggling, (3) cold-wake auth, (4) the PAC-emitter test contract, and the two quietly-dropped features (inspector, external API).