# SwitchyOmega 3 — MV3 preview build

This is a **preview build** of the Manifest V3 rewrite (from branch `mv3-rewrite`).

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
