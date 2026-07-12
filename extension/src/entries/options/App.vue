<script setup lang="ts">
import { onMounted } from 'vue'
import { useOptionsStore } from '@/ui/store'
import { t } from '@/ui/i18n'
import Sidebar from '@/ui/components/Sidebar.vue'

const store = useOptionsStore()

onMounted(() => {
  store.load().catch((e) => console.error('Failed to load options', e))
  window.addEventListener('beforeunload', (ev) => {
    if (store.isDirty) {
      ev.preventDefault()
      ev.returnValue = ''
    }
  })
})

async function apply(): Promise<void> {
  await store.apply()
}
function discard(): void {
  store.discard()
}
</script>

<template>
  <div class="app">
    <Sidebar />
    <main class="content">
      <div
        v-if="!store.loaded"
        class="loading"
      >
        {{ t('options_loading') || 'Loading…' }}
      </div>
      <router-view v-else />
    </main>
    <transition name="bar">
      <div
        v-if="store.isDirty"
        class="apply-bar"
      >
        <span>{{ t('options_unsavedChanges') || 'You have unsaved changes.' }}</span>
        <div class="spacer" />
        <button
          class="btn ghost"
          @click="discard"
        >
          {{ t('options_discardButton') || 'Discard' }}
        </button>
        <button
          class="btn primary"
          @click="apply"
        >
          {{ t('options_applyButton') || 'Apply changes' }}
        </button>
      </div>
    </transition>
  </div>
</template>

<style>
:root {
  --so-bg: #f4f6fa;
  --so-panel: #ffffff;
  --so-border: #d8dee9;
  --so-text: #1f2933;
  --so-muted: #647089;
  --so-accent: #2f6feb;
  --so-danger: #d64545;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: var(--so-text);
  background: var(--so-bg);
}
.app {
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 100vh;
}
.content {
  padding: 2rem 2.5rem 6rem;
  max-width: 920px;
}
.loading {
  color: var(--so-muted);
  padding: 2rem 0;
}
h1 {
  font-size: 1.5rem;
  margin: 0 0 1rem;
}
h2 {
  font-size: 1.05rem;
  margin: 1.5rem 0 0.5rem;
}
.field {
  display: block;
  margin: 0.75rem 0;
}
.field > label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.25rem;
}
input[type='text'],
input[type='number'],
input[type='url'],
input[type='password'],
select,
textarea {
  width: 100%;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--so-border);
  border-radius: 6px;
  background: var(--so-panel);
  font: inherit;
}
textarea {
  min-height: 8rem;
  font-family: ui-monospace, monospace;
}
.row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.btn {
  padding: 0.45rem 0.9rem;
  border: 1px solid var(--so-border);
  border-radius: 6px;
  background: var(--so-panel);
  cursor: pointer;
  font: inherit;
}
.btn:hover {
  background: #eef1f6;
}
.btn.primary {
  background: var(--so-accent);
  border-color: var(--so-accent);
  color: #fff;
}
.btn.primary:hover {
  filter: brightness(1.05);
}
.btn.danger {
  color: var(--so-danger);
  border-color: var(--so-danger);
}
.card {
  background: var(--so-panel);
  border: 1px solid var(--so-border);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin: 0.75rem 0;
}
.apply-bar {
  position: fixed;
  left: 260px;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 2.5rem;
  background: #fff;
  border-top: 1px solid var(--so-border);
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.06);
}
.spacer {
  flex: 1;
}
.bar-enter-from,
.bar-leave-to {
  transform: translateY(100%);
}
.bar-enter-active,
.bar-leave-active {
  transition: transform 0.15s ease;
}
</style>
