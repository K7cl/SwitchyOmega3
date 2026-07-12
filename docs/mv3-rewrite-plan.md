# SwitchyOmega MV3 Deep-Rewrite — Implementation Plan (Final)

## 1. Executive Summary

**What we're building.** A ground-up rewrite of SwitchyOmega as a **Chrome/Chromium-only Manifest V3 extension**, preserving 100% of the current feature set (profiles, auto-switch rules, PAC generation, rule-list subscriptions, import/export, sync, quick-switch, popup, options page, i18n, element inspector, external/legacy-import APIs) while replacing the entire 2014-era stack (CoffeeScript, Grunt, Browserify, Bower, AngularJS 1.7, Jade, LESS, Bootstrap 3, bluebird, uglify-js) with a modern, minimal, TypeScript toolchain.

**Guiding principles.**
1. **Preserve proven logic, replace proven-obsolete tooling.** The PAC/rule engine in `omega-pac` is battle-tested and correct — we *port* it to TypeScript with its test suite (converted to a **behavioral** contract) as the acceptance gate; we do not reinvent it. The build/UI/adapter layers are rewritten.
2. **Security-first.** Strict CSP (`script-src 'self'`), zero `eval`/`new Function` in shipped code, no remote code, pinned lockfile, minimal permissions, validated inputs. The PAC string is *data handed to `chrome.proxy`*, never executed in the extension context.
3. **MV3-native, not MV3-patched.** Service-worker background designed from the start to be ephemeral and rehydratable — every event handler reads authoritative state from `chrome.storage`, never trusting in-memory globals. We adopt ZeroOmega's *proven techniques* but implement them cleanly in TS.
4. **Chrome/Chromium only.** Drop all Firefox code paths (`browser.proxy.onRequest`, `ListenerProxyImpl`, `FirefoxProxyImpl`, `ScriptProxyImpl`, `manifest-firefox.json`, gecko settings).
5. **No obscure dependencies.** Every runtime dependency is mainstream, maintained, and justified. Prefer first-party (Vue/vue-router/pinia) and standard web APIs over one-off plugins.
6. **Incremental & loadable.** Every phase ends in an extension you can load unpacked in Chrome and verify — including a minimal `_locales/en` from Phase 0 so the manifest's `__MSG_*__` references always resolve.

**Key MV3 facts that shape the design:**
- `chrome.proxy` is **fully supported in MV3, unchanged** — the inline-PAC path (`pacScript.data`) is the compliant, standard pattern. Passing PAC as data to a browser API is **not** `eval` in the extension context; the string runs inside Chrome's own proxy-resolver sandbox.
- The committed proxy setting **persists in the browser's `ChromeSetting` store across SW restarts** — we do not re-apply on every wake, only reconcile on `onStartup`/`onInstalled` and on external change.
- Proxy **auth** is the one genuinely hard gap and has a **cold-wake race** (see §4.4) that must be resolved by a spike, not deferred: a blocking `onAuthRequired` handler cannot `await` an async storage read, so credentials must be synchronously readable at handler-invocation time.
- **Legacy `_state` lived in `localStorage`**, which a service worker **cannot read**. In-place upgrade therefore requires a DOM-capable migration context (offscreen document or migration page) — this is a first-class roadmap phase, not an open question.
- Keepalive is not needed for proxy-setting correctness (the setting persists); it is only potentially relevant to the auth cold-wake race, and is scoped accordingly.

---

## 2. Target Architecture

### 2.1 Repo / package layout

Single repo, **pnpm workspace monorepo**, TypeScript throughout. The extension build tool (WXT vs. Vite+`@crxjs/vite-plugin` — see §2.2 and Decisions) owns the extension package; the logic packages are plain TS libraries consumed by it.

```
switchyomega/                      (repo root)
├─ package.json                    # workspace root, scripts, shared devDeps
├─ pnpm-workspace.yaml
├─ pnpm-lock.yaml                  # committed, exact versions
├─ tsconfig.base.json
├─ eslint.config.ts
├─ vitest.workspace.ts
├─ packages/
│  ├─ omega-pac/                   # PORT: pure PAC/rule/profile logic (TS)
│  │  ├─ src/{conditions,profiles,rule_list,pac_generator,shexp_utils,utils}.ts
│  │  ├─ src/pac_ast/              # NEW: minimal PAC code emitter (replaces uglify-js AST)
│  │  ├─ src/index.ts
│  │  ├─ test/                     # ported mocha→vitest specs (behavioral contract)
│  │  └─ package.json
│  ├─ omega-core/                  # PORT+REWRITE: was omega-target (options manager, sync)
│  │  ├─ src/{options,storage,options_sync,log,errors,default_options,upgrade}.ts
│  │  ├─ src/proxy/proxy_impl.ts   # ProxyImpl interface (abstract)
│  │  └─ package.json
│  └─ omega-i18n/                  # NEW: locale build → _locales generator (replaces po2crx)
│     └─ src/build_locales.ts
├─ extension/                      # the actual MV3 extension project
│  ├─ (wxt.config.ts | vite.config.ts + manifest.ts)
│  ├─ entrypoints/  (or src/entries/)
│  │  ├─ background.ts             # SW entry (bootstrap + listener registration)
│  │  ├─ offscreen/                # NEW: DOM-capable migration + any DOM-only helpers
│  │  ├─ options/                  # Vue options SPA (index.html + main.ts + App.vue)
│  │  └─ popup/                    # Vue popup (index.html + main.ts + App.vue)
│  ├─ src/
│  │  ├─ adapter/                  # REWRITE: chrome.* bindings
│  │  │  ├─ chrome_options.ts      # extends omega-core Options
│  │  │  ├─ chrome_storage.ts
│  │  │  ├─ state_store.ts         # chrome.storage.session/local wrapper
│  │  │  ├─ proxy/proxy_impl_settings.ts
│  │  │  ├─ proxy/proxy_auth.ts    # sync-readable credential cache + onAuthRequired
│  │  │  ├─ proxy/incognito.ts     # incognito scope handling
│  │  │  ├─ fetch_url.ts           # fetch() based
│  │  │  ├─ web_request_monitor.ts
│  │  │  ├─ inspect.ts             # chrome.scripting element inspector (if in scope)
│  │  │  ├─ external_api.ts        # onConnectExternal + allowlist (if in scope)
│  │  │  ├─ migration/             # legacy localStorage → chrome.storage upgrade
│  │  │  ├─ icon.ts                # OffscreenCanvas icon renderer
│  │  │  ├─ action.ts              # dynamic setPopup (quick-switch cycle mode)
│  │  │  ├─ tabs.ts, context_menu.ts, alarms.ts
│  │  │  └─ messaging.ts           # typed SW<->UI message bus
│  │  ├─ ui/                       # Vue components, composables, router, stores
│  │  └─ shared/                   # types, message-schema, validation
│  └─ package.json
├─ locales/                        # KEEP: gettext .po (moved from omega-locales)
│  └─ <locale>/LC_MESSAGES/omega-web.po
└─ .github/workflows/ci.yml        # NEW: GitHub Actions (replaces CircleCI)
```

Rationale for renames: `omega-target` → `omega-core` (platform-agnostic core); `omega-target-chromium-extension` collapses into `extension/` with its adapter code under `extension/src/adapter`; `omega-web` disappears as a package — its screens become Vue components inside `extension/`.

### 2.2 Toolchain

| Concern | Choice | Why |
|---|---|---|
| Package manager / monorepo | **pnpm workspaces** | Deterministic, single lockfile, strict node_modules (no phantom deps), first-class workspace linking. |
| Extension framework / bundler | **WXT (Vite)** *or* **Vite + `@crxjs/vite-plugin`** — decide before Phase 0 (see Decisions) | Both auto-assemble the MV3 manifest, bundle the ES-module SW + entrypoints, and give HMR. **WXT is pre-1.0 (0.20.x)** and generates the manifest from config; `@crxjs/vite-plugin` keeps a real hand-authored `manifest.json`. Whichever we pick, it is **pinned to an exact version**, and CI asserts the built manifest byte-matches the §4.6 target (see §7). |
| UI framework | **Vue 3** (SFC + `<script setup>`) | Template model maps ~1:1 from AngularJS directives; SFC templates are **compiled at build time → no runtime compiler → CSP-safe, no `unsafe-eval`**; first-party router + store minimize third-party deps. |
| Language | **TypeScript, strict** | Type safety across the PAC engine, options model, and SW↔UI boundary; catches latent bugs (`regexSafe`, `not err instanceof`). |
| Styling | **Plain modern CSS**: SFC `<style scoped>` + CSS custom properties | Zero runtime, CSP-safe; drops Bootstrap 3 + Glyphicons + LESS. |
| Test | **Vitest** (+ `@vue/test-utils` + `happy-dom`) | Vite-native; `vi.fn`/`vi.useFakeTimers` replace sinon/lolex; specs port near-verbatim. Test-only `eval` of generated PAC lives strictly in the runner. |
| Lint / typecheck | ESLint + `typescript-eslint` + `eslint-plugin-vue`; `vue-tsc --noEmit` | CI gates, including a custom check that fails the build on `eval(`/`new Function(` or a manifest requiring `unsafe-eval`. |
| CI | **GitHub Actions** | Replaces the dead CircleCI `node:7.10` config. |
| One-time migration aid | `decaffeinate` (via `npx`, not a dep) | CoffeeScript→JS starting point per file, then hand-refine to strict TS. |

### 2.3 Minimal runtime dependency list (each justified)

**`packages/omega-pac`:**
- **`ip-address`** (v9+) — IPv4/IPv6 parsing & subnet math for `IpCondition`/`BypassCondition`. Adapt to the v9 `Address4`/`Address6` API.
- **`tldts`** — replaces the semi-deprecated `tldjs`. Public-suffix / base-domain parsing.
- *(No `uglify-js`.)* Dropped entirely; replaced by a small purpose-built PAC emitter (§4.3), removing the vendored 6722-line browser bundle.

**`packages/omega-core`:**
- **`jsondiffpatch`** (current maintained major) — profile diff/patch for options save and sync conflict resolution. **The deletion-sniff (`delta.length==3 && [1]==0 && [2]==0`) and `merge()` semantics differ in the modern major and must be re-validated with fixture tests** before we rely on them.
- *(No `bluebird`)* — native `Promise`/async-await. `Promise.props`→`Promise.all` over entries; `.tap`/`.return`→plain chaining; typed `.catch(ErrorClass, fn)`→`catch` + `instanceof` re-throw.
- *(No `limiter`)* — the token-bucket sync throttle is hand-rolled (~30 lines).

**`extension/`:**
- **`vue`** (aliased to the **runtime-only** build — template compiler never bundled).
- **`vue-router`** — options page has 5+ routed views.
- **`pinia`** — single options store (dirty tracking, diff-based save).
- **`idb-keyval`** *(optional)* — IndexedDB wrapper for durable rotating logs; used only if `chrome.storage.local` + `unlimitedStorage` proves insufficient (§4.5).
- *(No `heap`)* — request-monitor ordering uses a bounded `Map` + periodic sweep.
- *(No `xhr`, `FileSaver`, `blob`, `script.js`, jQuery/jQuery-UI, spectrum, shepherd, ladda, ngProgress, touch-punch, moment, csso)* — replaced by `fetch()`, `<a download>`, native `<input type="color">`, native HTML5 DnD (or `vuedraggable` only if native proves painful), `Intl`.

**Dev core:** the chosen extension framework, `typescript`, `vue-tsc`, `vitest`, `@vue/test-utils`, `happy-dom`, `eslint` + `typescript-eslint` + `eslint-plugin-vue`, `@types/chrome`.

---

## 3. KEEP / PORT / REWRITE / DROP per existing package

| Package | Verdict | Detail |
|---|---|---|
| **omega-pac** | **PORT (behavior-preserving)** | Crown jewel. Port module-by-module to TS, keeping the public API (`Profiles`, `Conditions`, `RuleList`, `PacGenerator`, `ShexpUtils`, `utils`). **Replace the uglify-js AST builder+printer with a new `pac_ast/` emitter** (§4.3). The acceptance gate is **behavioral** (eval + result matrix), not string-equality (§4.3, Phase 1). Fix latent bugs surfaced by TS strict (`regexSafe`→`safeRegex` dead branch; `regExpMetaChars[code] >= 0` coercion). Preserve `AST_Raw` raw-PAC injection and the `/*OmegaProfile*name*rev*/` header contract. |
| **omega-target** | **PORT + REWRITE** → `omega-core` | Port `Options`, `Storage`, `OptionsSync`, `Log`, errors. **Rewrite** the Promise layer (bluebird→native), storage for async-only SW use, and add explicit **rehydration entry points** and a **`schemaVersion` upgrade chain** (`upgrade.ts`, extended to v3, with a real pre-upgrade profile snapshot as a fixture — see §4.7). Fix latent bugs (`BrowserStorage#remove`, `not err instanceof`). Keep the overridable `Options` methods and the `ProxyImpl` interface. |
| **omega-target-chromium-extension** | **REWRITE** → `extension/src/adapter` | Most MV2-coupled package. Keep the *shapes* of the `chrome.proxy` config objects and the PAC-call sequence. Rewrite: SW bootstrap; `chrome.action` (was `browserAction`) incl. **dynamic `setPopup`** for quick-switch cycle mode (§4.2); `OffscreenCanvas` icon; `fetch`; `chrome.storage`-backed state; context menus via `onClicked`; `chrome.alarms` (recreated on startup); `webRequestAuthProvider` auth with a **sync-readable credential cache**; incognito scope handling; optional element inspector via `chrome.scripting`; optional external/legacy APIs. Drop all Firefox impls. |
| **omega-web** | **REWRITE (feature-preserving)** → `extension/src/ui` + entrypoints | Full UI rewrite AngularJS→Vue 3. **Every screen/feature ported** (§5). Reuse the message-based backend as a typed client. Unify on one Vue popup **only if the Phase-6 TTI budget is met** (§4.8); otherwise keep a lightweight non-framework popup. Drop jQuery/Bootstrap3/Jade/LESS/all Angular plugins. Keep diff-based save as an explicit pinia action. |
| **omega-build** | **DROP** | Grunt-hub obsolete; replaced by pnpm scripts + the extension framework + GitHub Actions. |
| **omega-locales** | **KEEP (data) + REWRITE converter** | Keep the 28 `.po` files (move to `locales/`). **Rewrite** `po2crx`/`po2json` as a standalone TS script (`packages/omega-i18n`) emitting `_locales/<lang>/messages.json` for **all** locales (the old pipeline wired only 6 of 28). A minimal en-only pass runs in Phase 0 so the manifest loads; full wiring in Phase 7. Runtime i18n stays on `chrome.i18n.getMessage`. |

---

## 4. MV3-Critical Design Decisions

### 4.1 Service-worker background

**Entry & bundling.** `background.ts` is the SW, built as an ES module. Our code is TS/ESM-native — **no `window` shim needed**. `omega-pac`/`omega-core` are imported as normal ESM.

**Bootstrap invariant.** The SW top-level must (a) register all event listeners **synchronously** and (b) lazily construct singletons on first need, rehydrating from storage. Additionally, at top-of-file it **synchronously hydrates a small credential cache** from `chrome.storage.session` (§4.4) so a blocking `onAuthRequired` can answer without awaiting.

```ts
// entrypoints/background.ts (sketch)
chrome.runtime.onInstalled.addListener(onInstalled)   // update → migration + upgrade chain
chrome.runtime.onStartup.addListener(onStartup)       // reconcile proxy + RE-CREATE alarms + re-assert setPopup
chrome.runtime.onMessage.addListener(messageRouter)   // returns true for async
chrome.runtime.onConnect.addListener(onConnect)       // network-inspect port
chrome.runtime.onConnectExternal.addListener(onExternal) // external API (if in scope) + allowlist
chrome.action.onClicked.addListener(onActionClicked)  // fires ONLY when no popup set (cycle mode)
chrome.contextMenus.onClicked.addListener(onMenuClicked)
chrome.alarms.onAlarm.addListener(onAlarm)
chrome.proxy.settings.onChange.addListener(onProxyChanged)
chrome.webRequest.onAuthRequired.addListener(authHandler, {urls:['<all_urls>']}, ['blocking'])
// credential cache hydrated synchronously at module top from a prior storage.session snapshot
```

**State re-application on startup.**
- `onInstalled{reason:'install'}` — first-run setup.
- `onInstalled{reason:'update'}` — trigger the migration/upgrade path (§4.7).
- `onStartup` (browser launch) — **reconcile**: read desired profile from `chrome.storage.local`, read live setting via `chrome.proxy.settings.get({})`, `.set()` only on divergence; **re-create all `chrome.alarms`** from stored settings (§4.5); **re-assert `chrome.action.setPopup`** per quick-switch mode (§4.2). Set an `isBrowserRestart` flag (cleared after ~2s) so temp-rule rehydration distinguishes cold start from SW respawn.
- On lazy construction after a mere respawn — rebuild in-memory state from storage; do **not** re-issue `chrome.proxy.settings.set` unless reconciliation shows drift.

### 4.2 chrome.proxy configuration path

`ProxyImplSettings` calls `chrome.proxy.settings.set({value, scope})` then `.get({})` to confirm. Config shapes (unchanged from today, all MV3-valid):
- **SystemProfile** → `clear({})`.
- **DirectProfile** → `{ mode:'direct' }`.
- **FixedProfile** → `{ mode:'fixed_servers', rules:{ singleProxy | proxyForHttp/Https/Ftp | fallbackProxy, bypassList } }`. Keep the HTTP-in-fallback expansion workaround and `<local>` bypass formatting.
- **PacProfile** → `{ mode:'pac_script', pacScript:{ url, mandatory:true } }` for file/remote URLs (see Decisions re: remote-PAC CWS policy), else `{ data: PacGenerator.ascii(script), mandatory:true }`.
- **SwitchProfile / RuleList / others** → `{ mode:'pac_script', pacScript:{ data:"/*OmegaProfile*<name>*<rev>*/" + ascii(compress(script(...))), mandatory:true } }`.

**Incognito.** `applyProfile` takes the target scope. On profile apply we set `scope:'regular'`, and — if `chrome.extension.isAllowedIncognitoAccess()` is true — **also** apply to `incognito_persistent` (default: mirror regular). The incognito behavior is a user-visible decision (see Decisions); the code path handles both scopes rather than silently only touching `regular`.

**PAC caching.** Module-level `Map` keyed by `profileName + revision` (or content sha256 for remote scripts), rebuilt lazily after respawn. Adopted from ZeroOmega.

**External-change watching + own-change guard.** `chrome.proxy.settings.onChange` → `parseExternalProfile` reverse-maps a config back to a profile (recognizing our `/*OmegaProfile*/` header). Chromium fires `onChange` on extension unload *after* we lose control, which would corrupt `currentProfileName`. Because the SW may be torn down before an in-flight `setTimeout` debounce fires, we do **not** rely on a timer alone: before every self-initiated `.set()` we write a short-lived **`expectingOwnChange` marker (with the expected config signature + timestamp) to `chrome.storage.session`**. A respawned SW's `onChange` handler reads this marker synchronously-after-async and ignores the matching spurious event, then clears it. The 500ms debounce is retained as a secondary smoothing measure only.

### 4.3 PAC / rule matching without eval (CSP compliance)

- **Where PAC runs.** The generated `FindProxyForURL` string runs inside **Chrome's own proxy-resolver sandbox**, not the extension. Passing `pacScript.data` to `chrome.proxy` is passing *data to a browser API* — it is **not** `eval` in the extension context and is fully MV3/CSP-compliant. The extension never `eval`s it.
- **Runtime rule matching in the UI/SW** (previews, temp-rule matching, `matchProfile`) uses the *interpreted* matchers already in `omega-pac` (`Conditions.match`, `Profiles.match`) — pure JS predicates, no code generation, no eval.
- **Replacing uglify-js.** New `packages/omega-pac/src/pac_ast/`: a minimal typed emitter (`fn`, `if_`, `switch_`, `ret`, `binary`, `call`, `str`, `regexp`, `raw`) whose `.toString()` prints valid JS, plus an ASCII escaper and a light whitespace/dead-code compressor. Each `compile()` returns these nodes. `AST_Raw` verbatim-injection (user PAC spliced with the `/* End of PAC */;` comment-terminator hack) becomes a `raw(code)` node. No general JS minifier needed.
- **Acceptance gate is behavioral, not byte-for-byte.** A hand-written emitter necessarily produces valid-but-different bytes than uglify-js, so the old exact-`print_to_string` string-equality assertions are **rewritten**. The ported suite instead **`eval`s the generated PAC in the Vitest runner and asserts `FindProxyForURL(url, host)` returns the correct proxy across a matrix of URLs × profile types**, plus the `/*OmegaProfile*name*rev*/` header round-trips through `parseExternalProfile`. Converting these expectations is explicit Phase-1 work. Test-only `eval` lives strictly in the runner, never in `src`.
- **`UglifyJS_NoUnsafeEval`** flag is **gone** — our emitter has no internal eval.

### 4.4 webRequest monitor + proxy auth

**Request monitor — keep, non-blocking.** `onBeforeRequest`/`onHeadersReceived`/`onBeforeRedirect`/`onCompleted`/`onErrorOccurred`, observational, `{urls:['<all_urls>']}`, powering the popup's per-tab error badge. Rework for SW ephemerality: bound the in-memory map (`MAX_REQUESTS = 1000`, evict done/timed-out; reset a tab's info on overflow); replace the 1s `setInterval` ticker with a lightweight sweep on request events plus a coarse `chrome.alarms` fallback (accepting cosmetic sub-second timeout imprecision under suspension); Chrome-only `onCompleted` `extraInfoSpec` may add `"extraHeaders"`.

**Proxy auth — the hard part, treated as a Phase-4 spike with a documented fallback.** Register `chrome.webRequest.onAuthRequired` in blocking form returning `{authCredentials}`, requiring **`webRequestAuthProvider`**. Two distinct problems:

1. *Priming before the first proxied request* — the **preflight-fetch wake**: when applying a profile whose proxy carries credentials, inject a temporary rule routing a bogus host (`preflight-auth.non-existent-website.<nonce>`) to the auth-bearing proxy, fire a throwaway `fetch()` while the SW is awake, then strip the rule in `.finally`. This helps only *while the SW is already awake at `applyProfile` time*.

2. *Cold-wake race (the real hazard)* — after a SW respawn, in-memory `_options` is empty and credentials live in async `chrome.storage`, but a **blocking** `onAuthRequired` handler must return credentials synchronously and cannot `await`. Resolution, in priority order, decided by the spike:
   - **(a)** Confirm whether Chrome MV3 permits **`'asyncBlocking'` / Promise-returning `onAuthRequired`** for non-enterprise extensions. If yes, the handler awaits a storage read — problem solved cleanly.
   - **(b)** If async blocking is not permitted, maintain a **synchronously-readable credential cache**: mirror *only* the proxy credentials for the active profile(s) into a module-global object that is hydrated at top-of-file from a `chrome.storage.session` snapshot written whenever credentials change or a profile is applied. The blocking handler reads this global directly. (Redacted from logs; never persisted to `local` in plaintext beyond what today's options already store.)
   - **(c)** As a last resort for a genuine race window, a **task-scoped bounded keepalive** (~25s `getPlatformInfo` ping) active only while an auth-bearing profile has been applied and is expected to receive its first request — **not** an indefinite heartbeat.
   - Ship a **fallback UX** (surface an auth-failure state in the popup with a re-enter-credentials prompt) if all of the above still miss an edge case. This is a spike deliverable with a chosen mechanism, not an open question.

### 4.5 State persistence across SW restarts + timers + keepalive

Tiers:
1. **Options (profiles + settings)** → `chrome.storage.local` (persistent) + `unlimitedStorage`. Source of truth; read on construction, never trusting stale globals.
2. **Transient UI/runtime state** (currentProfileName, proxyNotControllable, proxyImplFeatures, inspectUrl, firstRun) → **`chrome.storage.session`** with durable bits mirrored to `local`. Replaces the old `localStorage`-backed `BrowserStorage`. We deliberately avoid ZeroOmega's in-memory-`Map`→IndexedDB `localStorage` polyfill.
3. **Temp-rule / temp-profile state** → `chrome.storage.session` (`tempProfileState`), rehydrated on `init()` after `ready`, then `applyProfile(currentProfileName)` re-asserts. On browser restart, session is empty → temp rules reset.
4. **Credential cache snapshot** → `chrome.storage.session` (§4.4b).
5. **Logs** → `chrome.storage.local` first; `idb-keyval`-backed IndexedDB only if size/rotation demands it, with 7-day rotation and a secret-redacting serializer (username/password/host/port/token/gistToken → `<secret>`).

**Timers.** All schedulers use **`chrome.alarms`** (profile-update interval, sync check), min period 0.5 min. Because **`alarms.persistAcrossSessions` is unreliable on older Chrome**, we do **not** assume create-once persistence: **all alarms are (re)created idempotently in `onStartup` and `onInstalled`** from stored settings, so auto-update and sync cannot silently stop after a browser restart. `setTimeout`/`setInterval` are used only for sub-alarm best-effort tasks that are backed by a durable marker where correctness matters (e.g. the proxy `onChange` guard uses the `storage.session` marker of §4.2, not the timer, for correctness).

**Keepalive.** Not used by default; the committed proxy setting persists without a live SW. The only sanctioned use is the task-scoped auth case in §4.4(c). Documented divergence from ZeroOmega's unconditional ping.

### 4.6 manifest.json (concrete MV3 target)

The chosen framework produces this; CI asserts a byte-match against this intended target (§7):

```json
{
  "manifest_version": 3,
  "name": "__MSG_manifest_app_name__",
  "version": "3.0.0",
  "description": "__MSG_manifest_app_description__",
  "default_locale": "en",
  "minimum_chrome_version": "109",
  "icons": { "16": "img/icons/omega-16.png", "48": "img/icons/omega-48.png", "128": "img/icons/omega-128.png" },
  "action": {
    "default_icon": { "16": "img/icons/omega-action-16.png", "32": "img/icons/omega-action-32.png" },
    "default_title": "__MSG_manifest_icon_default_title__"
  },
  "background": { "service_worker": "background.js", "type": "module" },
  "options_ui": { "page": "options.html", "open_in_tab": true },
  "commands": { "_execute_action": { "suggested_key": { "default": "Alt+Shift+O" } } },
  "permissions": [
    "proxy", "storage", "unlimitedStorage", "alarms",
    "tabs", "contextMenus", "webRequest", "webRequestAuthProvider",
    "offscreen"
  ],
  "optional_permissions": ["scripting"],
  "host_permissions": ["<all_urls>"],
  "content_security_policy": { "extension_pages": "script-src 'self'; object-src 'self'" }
}
```

Notes / deltas & justifications:
- **`action` deliberately omits `default_popup`.** The popup is set **at runtime** via `chrome.action.setPopup` (§4.2) so quick-switch **cycle-on-click** works: `onClicked` fires only when no popup is set. On enabling cycle mode → `setPopup({popup:''})`; otherwise → `setPopup({popup:'popup.html'})`. This is re-asserted on every `onStartup`/wake from stored settings, since `setPopup` state does not persist across SW lifecycles reliably.
- **`minimum_chrome_version: "109"`** — pinned to the actual feature floor we depend on, not a round number: `webRequestAuthProvider` (Chrome 108), `chrome.storage.session` access from the SW (~102), SW ES modules (88), and **`chrome.offscreen` (109)** for the migration path (§4.7). If migration uses a visible options/migration tab instead of offscreen, the floor drops accordingly. **Confirm exact floors before Phase 0** (see Decisions).
- **`offscreen`** permission present for the migration DOM context (§4.7). Retained only if migration/offscreen is used; otherwise removed.
- **`scripting` in `optional_permissions`** — requested at runtime only if the user uses the **element inspector** (§4.9). If the inspector is scope-cut (see Decisions), this key is removed.
- **`webRequestAuthProvider` present, `webRequestBlocking` absent** — the MV3 auth mechanism.
- **`downloads` dropped** — export uses `<a download>` from UI pages.
- **`<all_urls>` in `host_permissions`** — required by webRequest observation + auth across proxied hosts (and, if in scope, by the inspector's programmatic injection). Narrowing to `optional_host_permissions` is a Decision item.
- **No `web_accessible_resources`** unless the inspector requires an injected asset (evaluate during §4.9).
- **`key`** — present **only** if we update the existing listing in place (preserve ID); absent for a fresh listing. Governed by the Decisions section.
- **Explicit CSP** — no `unsafe-eval`/`unsafe-inline`; Vue runtime-only + SFC-compiled templates pass without exceptions.

### 4.7 Data migration / upgrade path (first-class)

The legacy extension stored `_state` (currentProfileName, proxyNotControllable, inspectUrl, firstRun, `config`, logs) in **`localStorage` via `BrowserStorage`**, plus options in `chrome.storage`. A service worker **cannot read `localStorage`**. Therefore, on an in-place update, any `localStorage`-only data is invisible to the SW unless read from a **DOM-capable context**.

**Mechanism.** On `chrome.runtime.onInstalled({reason:'update'})`:
1. Open a **one-time hidden migration context with DOM access** — a `chrome.offscreen` document (reason: `DOM_SCRAPING`/`localStorage` access) or, if offscreen is not used, a dedicated migration page/tab.
2. In that context, read the legacy `localStorage` `_state`/`config`/logs, plus existing `chrome.storage` options.
3. Translate into the new layout: durable options → `chrome.storage.local`; transient state → `chrome.storage.session`/`local` mirror; credentials → the credential-cache snapshot (§4.4).
4. Run the **`schemaVersion` upgrade chain**, extended **v2 → v3**, in `omega-core/src/upgrade.ts`.
5. **Verify** against a checked-in **snapshot of a real pre-upgrade profile set** (fixture-based test) — round-trip must reproduce equivalent behavior (same active profile, same rules, same sync state).
6. Close the migration context; mark migration complete with a durable flag so it never re-runs.

**SwitchySharp legacy import** (`upgrade()`'s SwitchySharp path + `switchysharp.coffee`, originally a 5s `setInterval` connect poller): kept or cut per Decisions. If kept, the poller becomes **event/alarm-driven** and rides on the external-messaging API (§4.9); it must not use a live `setInterval` under the SW.

Whether migration is needed at all depends on the **new-listing-vs-update-in-place** decision, which must be made **before Phase 0** because it determines whether we preserve `key` and build the migration phase.

### 4.8 Popup startup latency (perf budget)

A framework popup is strictly slower to first paint than the old vanilla popup + persistent page: worst case is SW cold-wake → async `chrome.storage` rehydration → message round-trip → Vue boot before the menu renders. Mitigations, treated as an explicit **Phase-6 TTI budget**:
- Render the popup **shell + last-known profile list synchronously** from a compact snapshot in `chrome.storage.session`/`local` (read directly by the popup, which itself has DOM), *before* the SW round-trip resolves; reconcile when the live response arrives.
- Keep Vue boot lean (runtime-only build, no heavy synchronous work on mount).
- The **unify-to-one-popup** decision (see Decisions) is **gated on hitting the TTI budget**; if the Vue popup cannot meet it, we keep a lightweight non-framework popup for open latency.

### 4.9 Dropped-feature recovery: inspector + external/legacy APIs

These are part of "100% feature set" and were at risk of silent omission:

- **Element inspector** (`setInspect`, `inspect.coffee`, "show inspect menu" UI, `inspectUrl`). Inspecting a page element requires injecting into the page — impossible without `chrome.scripting` + host access. **Delivery mechanism:** request `scripting` from `optional_permissions` at first inspector use, programmatically inject a content script to capture the target element and post it back, then build a rule. If the inspector is **scope-cut**, remove the toggle from the UI *and* the `scripting`/`web_accessible_resources` keys — no orphaned UI. (Decision item.)
- **External-messaging API** (`external_api.coffee`, `chrome.runtime.onConnectExternal`, `options.externalApi`, `knownExts` allowlist) lets other extensions drive SwitchyOmega and underpins SwitchySharp import. **If kept:** implement `onConnectExternal` handling + the allowlist in `adapter/external_api.ts` and add it to the messaging phase. **If dropped:** documented as a deliberate parity break. (Decision item.)
- **SwitchySharp import** — tied to the external API and the migration path (§4.7). Keep or cut per Decisions; if kept, event/alarm-driven, not `setInterval`.

---

## 5. UI Rewrite — Complete Feature/Screen Checklist → New Framework Mapping

**Mapping strategy.** AngularJS controllers → Vue components + composables; `ui-router` states → `vue-router` routes; `$rootScope.options` + deep `$watch` dirty tracking + jsondiffpatch save → a **pinia `options` store** holding `current` + `snapshot`, a computed `isDirty`, and an `applyOptions()` action that diffs `snapshot`→`current` with `jsondiffpatch` and sends only the patch. The `omegaTarget` Angular service → a typed **`useOmegaTarget()` composable** wrapping `chrome.runtime.sendMessage` + `chrome.runtime.connect` for streaming `tabRequestInfo`/network-inspect. `chrome.i18n.getMessage` → a `t()` composable + a Vue directive for HTML messages (replacing `omegaHtml`).

**Router:** `/about` (default), `/ui`, `/general`, `/io`, `/profile/:name`. Default route restores `lastUrl()` else `/about`. Navigation guards replace `$stateChangeStart` (form-validity focus, unsaved-changes confirm, `beforeunload`).

### Options shell & nav
- [ ] Sidebar: setting tabs + sorted/filtered profile list + New Profile + Apply/Discard + experimental badge
- [ ] Global alert bar (success/warning/error, auto-hide)
- [ ] Dirty tracking + unsaved-changes `beforeunload` + apply-confirm modal + form-validity nav guard
- [ ] jsondiffpatch patch-based save (pinia `applyOptions`) — **delta format re-validated against modern jsondiffpatch**

### Routed screens
- [ ] **UI settings** — confirm-deletion, refresh-on-change, **inspect menu (backed by §4.9 or scope-cut with the toggle removed)**, add-conditions-to-bottom, shortcut-config launcher, startup profile, show-condition-types, quick-switch enable
- [ ] **Quick Switch** — cycled vs not-cycled drag lists (native HTML5 DnD); **cycle mode drives runtime `setPopup` (§4.2)**
- [ ] **General** — monitor web requests toggle, download interval select, conflicts/priority explainer, show-external-profile
- [ ] **Import/Export** — backup export (`OmegaOptions.bak`), restore from local file, restore online (URL), export-legacy-rule-list toggle
- [ ] **Options Sync** — enable/disable/force/reset across pristine/sync/conflict/unsupported states
- [ ] **About** — description, report issue, download error log, reset options, version, disclaimers, credits (Chrome-only; drop the Firefox experimental warning)

### Profile editors
- [ ] **Header** — export rule list, export PAC, rename, delete, color picker (`<input type="color">`), sync-disabled banner
- [ ] **Fixed** — multi-scheme proxy grid, protocol select (HTTP/HTTPS/SOCKS4/SOCKS5), host/port, per-proxy **auth modal**, show-advanced, bypass-list textarea ↔ `BypassCondition[]` two-way sync, SOCKS5-auth capability detection
- [ ] **PAC** — PAC URL (file:// handling, referenced restriction), download-now, PAC script textarea, update/obsolete banners, auth-for-all modal
- [ ] **Switch (auto switch)** — sortable rules table (native DnD), per-rule condition-type selector, per-type condition editors, result-profile dropdown, add/clone/delete/note/reset rules, default-profile row, **attached rule-list sub-profile** (create/remove, format, source URL, download, inline text, error validation), **edit-source mode** (raw Switchy list ↔ table via jsondiffpatch merge), condition-help panel, legacy+modern export, full-URL-limitation warnings. `$watch` chains → explicit Vue `watch`/`computed`.
- [ ] **Rule list** — match/default profile selects, format radios, source URL, download, rule-list text
- [ ] **Virtual** — target profile select + replace-profile-everywhere
- [ ] **Unsupported** — fallback for unknown types

### Condition editors (Switch)
- [ ] HostWildcard, HostRegex, HostLevels, UrlWildcard, UrlRegex, Keyword, Ip (parser/formatter, was `omega-ip2str`), Weekday, Time, False/True — with live regex/IP validation and full-URL warnings

### Modals
- [ ] New / Rename / Replace / Delete / Cannot-delete / Delete-attached / Apply-confirm / Reset-confirm / Rule-remove-confirm / Rule-reset-confirm / Proxy-auth-edit / First-run-welcome (Vue modal component + teleport)

### Popup (single Vue popup **if** §4.8 TTI budget met; else lightweight non-framework popup)
- [ ] Quick-switch menu (builtin + custom profiles), virtual-profile default-picker dropdowns, external-profile inline-name form, request-info error badge, add-condition form, temp-rule dropdown, request-info-for-domains bulk form, proxy-not-controllable panel
- [ ] **Keyboard nav + shortcuts** (j/k/0/s/e/a/t/o/r/?/1-9) + help overlay — preserved feature-for-feature
- [ ] Synchronous shell render from `storage` snapshot before SW round-trip (§4.8)

### Cross-cutting
- [ ] Reusable components: `ProfileSelect`, profile icon/inline, clearable input, file upload, IP condition input
- [ ] HTML-message rendering with `$profile()` placeholders → interpolation component/slot; **never `v-html` untrusted content** (rule-list/subscription text rendered as escaped text)
- [ ] Filters → composables/computed: `profiles` (filter/sort), `tr` (i18n), `dispName`
- [ ] Guided tours — tiny custom step component (or `driver.js` only if custom proves painful)
- [ ] Error-log capture (`window.onerror` → log store) + downloadLog/reportIssue/resetOptions hooks
- [ ] File-download via `<a download>` (UI pages have DOM)
- [ ] Native `Intl` for dates/plurals; drop `angular-locale_*.js`

---

## 6. Phased Execution Roadmap

Each phase ends in an extension that **loads unpacked** (`.output`/`dist` → Load unpacked). **Phase 0 ships a minimal `_locales/en/messages.json`** so the manifest's `__MSG_*__` + `default_locale:"en"` resolve from the very first load.

**Phase 0 — Scaffold + hello-world SW + en locale stub.**
- pnpm workspace, `tsconfig.base.json`, ESLint/Vitest config, chosen framework config (Chrome target, §4.6 manifest), `background.ts` logging on `onInstalled`/`onStartup`, empty options + popup entrypoints, **en-only `omega-i18n` pass producing `_locales/en/messages.json`**, CI skeleton (typecheck+lint+test + manifest byte-match assertion).
- Verify: `pnpm dev` → load unpacked → **manifest loads with no `__MSG_*__`/locale error**; SW registers cleanly; popup/options open blank.

**Phase 1 — Port omega-pac to TS (logic + behavioral tests).**
- TS modules for conditions/profiles/rule_list/shexp_utils/utils; new `pac_ast/` emitter; `ip-address`@9 + `tldts` swaps; **vitest suite rewritten to the behavioral contract** (eval generated PAC + result matrix + header round-trip) — old exact-string assertions converted.
- Verify: `pnpm --filter omega-pac test` green; spot-check `FindProxyForURL` results against current behavior for representative profiles.

**Phase 2 — Port omega-core (options manager) to TS.**
- `options.ts`, `storage.ts`, `options_sync.ts` (hand-rolled token bucket), `log.ts`, `errors.ts`, `default_options.ts`, **`upgrade.ts` with the v2→v3 chain**; unit tests for `Options`/`Storage`; **jsondiffpatch delta-format fixture tests**.
- Verify: `pnpm --filter omega-core test` green; Node harness exercises load/upgrade/applyProfile/matchProfile with fake storage + stub `ProxyImpl`.

**Phase 3 — Adapter: real chrome.proxy switching (no UI yet).**
- `chrome_storage.ts`, `state_store.ts`, `proxy_impl_settings.ts` (all 5 modes + PAC cache + **incognito scope**), SW wiring, `onStartup` reconciliation + **alarm re-creation** + **`setPopup` re-assertion**, `chrome.action` badge/icon via `OffscreenCanvas`, context menu `onClicked`, `chrome.alarms` scheduler, `fetch_url.ts`, **`onChange` own-change marker guard**.
- Verify: seed Fixed + Switch profiles via dev message; confirm routing via `chrome://net-internals`/test sites; toggle System/Direct; **terminate the SW and confirm proxy stays applied + state rehydrates**; toggle quick-switch cycle mode and confirm click cycles vs opens popup.

**Phase 3.5 — Upgrade / migration.**
- `adapter/migration/` + offscreen (or migration-page) reader for legacy `localStorage`; translate into new storage layout; wire the v2→v3 chain; **verify against a checked-in pre-upgrade profile snapshot**; one-time completion flag. (Only if update-in-place is chosen — see Decisions.)
- Verify: install the old build, populate real options + localStorage state, load the new build as an update, confirm active profile/rules/sync all survive; confirm migration runs once.

**Phase 4 — Proxy auth spike + webRequest monitor.**
- `proxy_auth.ts`: **spike** async-vs-sync `onAuthRequired`, land on (a)/(b)/(c) from §4.4 with the sync-readable credential cache + preflight-fetch + documented fallback UX; `web_request_monitor.ts` (bounded map, alarm sweep).
- Verify: auth-requiring proxy; load a page **from a cold SW** (terminate first); credentials applied without prompt; error badge increments on failure; fallback UX appears on deliberately-wrong credentials.

**Phase 5 — UI: options SPA.**
- `useOmegaTarget` + typed message router; pinia options store (dirty + diff-save); vue-router; all routed screens, profile editors, condition editors, modals, reusable components; scoped CSS theme; **inspector wiring or documented scope-cut**; **external/legacy API wiring or documented cut**.
- Verify: create/edit/rename/delete every profile type; Switch rules (drag, add rule-list, edit-source round-trip); Apply persists + changes proxy; import/export/backup/restore; sync flows.

**Phase 6 — UI: popup (with TTI budget).**
- Popup entrypoint, quick-switch menu, add-condition/temp-rule/request-info forms, proxy-not-controllable panel, keyboard shortcuts + help, **synchronous snapshot render**; measure TTI against budget → decide unify-vs-keep-lightweight.
- Verify: switch profiles from popup; keyboard nav; temp rule; badge reflects errors; **cold-open TTI within budget**.

**Phase 7 — i18n (all locales).**
- `packages/omega-i18n` converts all 28 `.po` → `messages.json` (fixing the 6-locale limit), wired as a build step/hook; runtime `t()` + HTML-message component.
- Verify: switch Chrome UI language; strings + localized profile names + placeholder substitution render.

**Phase 8 — Packaging & CI.**
- GitHub Actions: frozen-lockfile install, `vue-tsc`, ESLint, Vitest, build + zip, `pnpm audit` gate, no-`unsafe-eval` check, **manifest byte-match assertion**; version stamping; CWS-zip artifact.
- Verify: CI green on clean checkout; produced zip loads unpacked and passes a manual smoke of Phases 3–7 (incl. cold-wake auth + migration).

---

## 7. Security & Dependency Policy

**CSP / no eval / no remote code.**
- Ship explicit `content_security_policy.extension_pages = "script-src 'self'; object-src 'self'"`. No `unsafe-eval`, no `unsafe-inline`, no remote hosts.
- Vue aliased to the **runtime-only** build; SFC (build-time-compiled) templates only; no `new Function`/`eval` in shipped code.
- CI gate fails if the bundle contains `eval(`/`new Function(` or the manifest requires `unsafe-eval`.
- PAC is emitted **as a string** handed to `chrome.proxy` (runs in Chrome's PAC sandbox); the extension never executes user PAC/config. Test-only `eval` lives strictly in the Vitest runner.
- No CDN scripts, remote fonts, or URL `import()`. All assets local. (If remote-`pacScript.url` is retained, treat the fetched PAC strictly as data handed to `chrome.proxy` — see Decisions re: CWS remote-code policy.)

**Build-tool / manifest integrity.**
- The extension framework is **pinned to an exact version**. Because a manifest can be generated from config (framework-owned CSP/permissions/`minimum_chrome_version`), **CI asserts the built manifest byte-matches the §4.6 target** (especially CSP + permission set + `minimum_chrome_version`), so config drift cannot silently widen privileges. The WXT-vs-crxjs tradeoff (pre-1.0 config-generated manifest vs. real hand-authored `manifest.json`) is recorded as a Decision.

**Permission minimization.**
- Requests only `proxy`, `storage`, `unlimitedStorage`, `alarms`, `tabs`, `contextMenus`, `webRequest`, `webRequestAuthProvider`, `offscreen` (migration), `<all_urls>`; `scripting` is optional (inspector only). Each justified in §4.6. Moving `<all_urls>`/`tabs` toward `optional_*`/`activeTab`, and dropping `offscreen`/`scripting` if those features are cut, are Decision items.

**Input validation.**
- Imported profiles / `OmegaOptions.bak` / online-restore JSON validated against a TS schema (shape, known types, lengths, no unexpected keys) before merge; unknown types → `Unsupported`.
- Imported PAC/rule lists treated as **data**; raw-PAC injection retains the comment-terminator neutralization.
- Never `v-html` untrusted content. All inbound `chrome.runtime.onMessage` **and `onConnectExternal`** payloads validated against a typed schema; external senders checked against the `knownExts` allowlist.
- Log serializer redacts secrets.

**Dependency hygiene / supply chain.**
- Single committed `pnpm-lock.yaml`; **exact** pinned runtime versions (no `^`); `pnpm install --frozen-lockfile` in CI.
- `pnpm audit` gate on high/critical; Renovate/Dependabot with review. Disable install scripts where possible. Every runtime dep mainstream + maintained; no wildcard/git/Bower deps.

**CI gates on every PR:** `vue-tsc --noEmit` + `tsc --noEmit`, ESLint, Vitest, audit, no-`unsafe-eval` check, and manifest byte-match.

---

## 8. Risks & Open Questions

**Platform facts to confirm against current Chrome/CWS docs before the affected phase:**
- Whether **`'asyncBlocking'`/Promise-returning `onAuthRequired`** is permitted for non-enterprise extensions (drives §4.4 auth architecture — Phase 4 spike).
- Whether blocking `onAuthRequired` via `webRequestAuthProvider` is accepted long-term for non-enterprise CWS listings.
- Exact minimum Chrome versions for `chrome.storage.session`-from-SW, `webRequestAuthProvider`, and `chrome.offscreen` (drives `minimum_chrome_version`; currently pinned to 109 for offscreen).
- Whether supplying a remote PAC via `pacScript.url` runs afoul of CWS remote-code policy (drives whether PAC-URL profiles stay or are inlined only).
- `chrome.alarms.persistAcrossSessions` reliability on the target floor (mitigated by unconditional re-creation on startup, but confirm).

**Technical risks (highest first):**
- **Cold-wake proxy auth** — the sync-vs-async race; mitigated by the credential cache and spike, but the residual edge case needs the documented fallback UX.
- **Migration data loss** — `localStorage` is unreadable from the SW; mitigated by the offscreen/migration-page reader + snapshot verification, but only exercised on real user data.
- **PAC emitter parity** — behavioral, not byte-for-byte; the eval-based result matrix is the non-negotiable gate; budget the bulk of Phase 1 here.
- **Switch-profile editor** — riskiest UI port (`$watch` chains → explicit effects; table↔raw-source jsondiffpatch round-trip). Port last with focused component tests.
- **Popup cold-open TTI** — framework boot is slower than the old vanilla popup; gated by the §4.8 budget.
- **jsondiffpatch delta drift** — modern deletion/merge semantics differ; fixture tests in Phase 2.
- **SW ephemerality bugs** — enforce "read from storage in handlers, never trust globals"; test with forced SW termination.

---

## Decisions needed from user (these materially change the build)

1. **New CWS listing vs. update-in-place.** Update-in-place requires preserving the extension `key`/ID **and** building Phase 3.5 migration (offscreen/localStorage reader + v2→v3 chain + snapshot verification). A fresh listing removes the entire migration phase and the `offscreen` permission. **Must be decided before Phase 0.**
2. **Is an automatic upgrade path from existing users' data required?** (Tightly coupled to #1. If "no auto-migrate," Phase 3.5 and `offscreen` are dropped even for an in-place update.)
3. **Extension framework: WXT (pre-1.0, config-generated manifest) vs. Vite + `@crxjs/vite-plugin` (real hand-authored `manifest.json`).** Both are viable; this affects who owns the manifest and the stability/supply-chain profile. CI manifest byte-matching applies either way.
4. **Firefox: confirmed dropped?** The whole plan assumes Chrome/Chromium only. Keeping Firefox reintroduces `browser.proxy.onRequest` and a second manifest.
5. **Proxy-auth architecture fallback.** Approve the §4.4 spike outcome ordering (async-blocking → sync credential cache → task-scoped keepalive → fallback UX). In particular: is a **task-scoped bounded keepalive** acceptable if the cold-wake race cannot otherwise be closed?
6. **Element inspector: keep (adds `scripting` + host injection) or scope-cut** (removes the UI toggle and the `scripting`/`web_accessible_resources` keys)?
7. **External-messaging API (`onConnectExternal` + allowlist) and SwitchySharp import: keep or cut?** These are part of "100% feature set" and gate part of the migration story.
8. **webRequest request-monitor (per-tab error badge): keep with `<all_urls>`, or make it optional behind `optional_permissions`** to ship a leaner default permission set (accepting CWS review friction either way)?
9. **Popup: unify on one Vue popup (gated on the §4.8 TTI budget) or keep a lightweight non-framework popup** for fastest cold-open?
10. **Incognito proxy behavior: mirror the regular scope, or explicitly unsupported** (affects `applyProfile` scope handling and user expectations)?
11. **UI framework: Vue 3 (assumed) — still the choice, or is React still open?** (Affects the entire §5 port and the runtime dep set.)
12. **Locale scope: wire all 28 locales** (fixing the old 6-locale limit) regardless of per-locale translation completeness?
13. **Remote PAC (`pacScript.url`) profiles: keep or inline-only**, pending the CWS remote-code-policy confirmation in §8?