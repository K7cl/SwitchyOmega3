import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { crx } from '@crxjs/vite-plugin'
import manifest from './src/manifest.config'

// Vite + @crxjs build for the MV3 extension.
// - @crxjs bundles the ES-module service worker + HTML entrypoints and emits
//   the final manifest.json (asserted byte-equal to intent in CI — Phase 8).
// - public/ (icons, _locales) is copied verbatim to dist/.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [vue(), crx({ manifest })],
  build: {
    target: 'esnext',
    // Deterministic-ish output; no legacy transforms.
    sourcemap: true,
  },
  server: {
    // Stable port for the HMR websocket during `pnpm dev`.
    port: 5173,
    strictPort: true,
  },
})
