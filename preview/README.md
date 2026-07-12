# SwitchyOmega 3 — MV3 preview build

This is a **preview build** of the Manifest V3 rewrite (from branch `mv3-rewrite`).

## What's new in this build

- **Faithful UI rework** — the options page and popup now reproduce the
  original SwitchyOmega look-and-feel (Bootstrap 3), rebuilt on Vue 3:
  - Options: fixed side-nav (Settings / Profiles / Actions), fixed screen
    header, and faithful editors — Fixed / Switch / PAC / Rule-list / Virtual.
  - Popup: original nav-pills menu, Direct/System pinned on top, distinct
    per-profile colors, active profile highlighted.
- Internal `__`-prefixed sub-profiles (e.g. attached rule lists) are hidden
  from the profile list and no longer cause navigation errors.
- Per-domain rule for the current tab, from the popup ("For this site").

## Install (Load unpacked)

1. Download **`switchyomega3-3.0.0.zip`** (in this folder) and unzip it.
2. Open Chrome → `chrome://extensions`.
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select the **unzipped folder** (the one containing `manifest.json`).
5. The SwitchyOmega icon appears in the toolbar — click it to switch profiles, right-click → Options to configure.

Notes:
- Unsigned preview: Chrome may show a "developer mode extensions" notice — that's expected for unpacked loads.
- Requires Chrome/Chromium **116+**.
- Sourcemaps are excluded from this package.

Built from `mv3-rewrite`. To rebuild yourself: `pnpm install && pnpm build` → load `extension/dist`.
