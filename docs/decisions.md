# Locked Decisions — MV3 Deep-Rewrite

Decided 2026-07-11/12 with the user. These override the "Decisions needed" section of `mv3-rewrite-plan.md`.

| # | Decision | Choice |
|---|---|---|
| Scope | Rewrite depth | **Deep rewrite** — modernize toolchain + UI, not a minimal patch |
| Target | Browsers | **Chrome/Chromium only** — Firefox code paths dropped |
| Build | Bundler / framework | **Vite + `@crxjs/vite-plugin`** (v2.7.1) — hand-authored, auditable `manifest.json` |
| UI | Framework | **Vue 3** (SFC + `<script setup>`) + `vue-router` + `pinia` |
| Listing | Upgrade path | **Update-in-place + auto-migration** — preserve extension `key`/ID; build Phase 3.5 offscreen migration + v2→v3 upgrade chain |
| Language | — | **TypeScript** strict, everywhere |
| Runtime | Node / pkg mgr | **Node 22 LTS**, **pnpm 9** workspace monorepo |

## Feature scope — TRIM ALL optional features for now (re-add later if missed)

User: "我没选任何功能，先都精简掉吧，到时候如果有异常缺功能再补"

**Dropped for the initial rewrite:**
- Element inspector (→ removes `scripting` optional permission + related web_accessible_resources + UI toggle)
- External-messaging API (`onConnectExternal` + `knownExts` allowlist) **and** SwitchySharp legacy import
- webRequest request-monitor + per-tab error badge in popup
- Remote PAC via `pacScript.url` (PAC/rule-lists are fetched and **inlined** as `pacScript.data`; no remote URL handed to chrome.proxy)

**Kept (core, NOT optional):**
- Proxy authentication → `webRequest` + `webRequestAuthProvider` + `onAuthRequired` (many users have authenticated proxies)
- Rule-list subscription download → `fetch()`, compiled & inlined into PAC

## Resulting lean permission set

```
permissions:      proxy, storage, unlimitedStorage, alarms, tabs, contextMenus,
                  webRequest, webRequestAuthProvider, offscreen
host_permissions: <all_urls>        # required by onAuthRequired for authenticated proxies
```
Dropped vs full-feature: `scripting` (optional). Future tightening option: move `<all_urls>` to `optional_host_permissions`, requested only when an authenticated proxy is configured.

## Migration note under "trim all"
Update-in-place still migrates **core** data (profiles + settings + active profile). If a legacy user had a dropped-feature config (e.g. a `pacScript.url` PAC profile), migration downloads+inlines where possible, else marks it `Unsupported` rather than losing the profile. Revisit if users report gaps.
