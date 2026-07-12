<script setup lang="ts">
import { ref } from 'vue'

// Phase 0 placeholder options screen.
const version = ref<string>('')

// Prove the page can talk to extension APIs (available on chrome-extension:// pages).
if (typeof chrome !== 'undefined' && chrome.runtime) {
  version.value = chrome.runtime.getManifest().version
}
</script>

<template>
  <main class="options">
    <h1>Proxy SwitchyOmega 3</h1>
    <p class="tag">
      Manifest V3 · Chrome/Chromium
    </p>
    <p>Options UI scaffold — the full settings SPA lands in Phase 5.</p>
    <dl>
      <dt>Version</dt>
      <dd>{{ version || 'n/a' }}</dd>
    </dl>
  </main>
</template>

<style scoped>
.options {
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  max-width: 40rem;
  margin: 3rem auto;
  padding: 0 1.5rem;
  color: #1f2933;
}
h1 {
  margin-bottom: 0.25rem;
}
.tag {
  color: #647089;
  margin-top: 0;
}
dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
  margin-top: 1.5rem;
}
dt {
  font-weight: 600;
}
</style>
