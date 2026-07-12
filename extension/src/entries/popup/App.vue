<script setup lang="ts">
// Phase 0 placeholder popup. Phase 6 builds the real quick-switch UI.
function openOptions(): void {
  if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
    chrome.runtime.openOptionsPage()
  }
}
</script>

<template>
  <div class="popup">
    <h1>SwitchyOmega 3</h1>
    <p>Quick-switch menu — Phase 6.</p>
    <button
      type="button"
      @click="openOptions"
    >
      Open options
    </button>
  </div>
</template>

<style scoped>
.popup {
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  width: 300px;
  padding: 1rem;
  color: #1f2933;
}
h1 {
  font-size: 1.1rem;
  margin: 0 0 0.5rem;
}
button {
  margin-top: 0.5rem;
  padding: 0.4rem 0.8rem;
  border: 1px solid #c4ccd8;
  border-radius: 6px;
  background: #f4f6fa;
  cursor: pointer;
}
button:hover {
  background: #e7ebf2;
}
</style>
