<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { callBackground } from '@/ui/messaging'
import { t, dispName } from '@/ui/i18n'

interface AvailableProfile {
  name: string
  profileType: string
  color?: string
}

const STATE_PREFIX = 'omega.state.'
const profiles = ref<AvailableProfile[]>([])
const current = ref('')
const proxyNotControllable = ref('')
const selected = ref(0)

const visibleProfiles = computed(() => profiles.value.filter((p) => !p.name.startsWith('__')))

// Fast path: read the last-computed state straight from storage (no SW wait).
async function loadSnapshot(): Promise<void> {
  try {
    const s = await chrome.storage.local.get([
      STATE_PREFIX + 'availableProfiles',
      STATE_PREFIX + 'currentProfileName',
      STATE_PREFIX + 'proxyNotControllable',
    ])
    const avail = (s[STATE_PREFIX + 'availableProfiles'] ?? {}) as Record<string, AvailableProfile>
    profiles.value = Object.values(avail)
    current.value = (s[STATE_PREFIX + 'currentProfileName'] as string) ?? ''
    proxyNotControllable.value = (s[STATE_PREFIX + 'proxyNotControllable'] as string) ?? ''
    const idx = visibleProfiles.value.findIndex((p) => p.name === current.value)
    if (idx >= 0) selected.value = idx
  } catch {
    /* first run — the SW will populate state shortly */
  }
}

async function apply(name: string): Promise<void> {
  current.value = name
  // Apply and refresh the active tab if the user enabled it (SW decides).
  chrome.runtime.sendMessage({ method: 'applyProfile', args: [name], refreshActivePage: true })
  setTimeout(() => window.close(), 120)
}

function openOptions(): void {
  chrome.runtime.openOptionsPage()
  window.close()
}

function onKey(e: KeyboardEvent): void {
  const list = visibleProfiles.value
  if (e.key === 'j' || e.key === 'ArrowDown') {
    selected.value = (selected.value + 1) % list.length
    e.preventDefault()
  } else if (e.key === 'k' || e.key === 'ArrowUp') {
    selected.value = (selected.value - 1 + list.length) % list.length
    e.preventDefault()
  } else if (e.key === 'Enter') {
    const p = list[selected.value]
    if (p) apply(p.name)
  } else if (e.key === 'o') {
    openOptions()
  } else if (e.key === 'Escape') {
    window.close()
  } else if (/^[1-9]$/.test(e.key)) {
    const p = list[Number(e.key) - 1]
    if (p) apply(p.name)
  }
}

onMounted(() => {
  loadSnapshot()
  // Reconcile with the SW's authoritative state once it responds.
  callBackground<Record<string, unknown>>('getState', null)
    .then((st) => {
      const avail = (st['availableProfiles'] ?? {}) as Record<string, AvailableProfile>
      if (Object.keys(avail).length) profiles.value = Object.values(avail)
      if (st['currentProfileName'] != null) current.value = st['currentProfileName'] as string
      proxyNotControllable.value = (st['proxyNotControllable'] as string) ?? ''
    })
    .catch(() => undefined)
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="popup">
    <div class="hd">
      <span class="title">Proxy SwitchyOmega</span>
    </div>

    <p
      v-if="proxyNotControllable"
      class="warn"
    >
      {{ t('popup_proxyNotControllable') || 'Proxy settings are controlled by another program.' }}
    </p>

    <ul class="profiles">
      <li
        v-for="(p, i) in visibleProfiles"
        :key="p.name"
        :class="{ active: p.name === current, hi: i === selected }"
        @click="apply(p.name)"
        @mouseenter="selected = i"
      >
        <span
          class="dot"
          :style="{ background: p.color || '#888' }"
        />
        <span class="name">{{ dispName(p.name) }}</span>
        <span
          v-if="i < 9"
          class="idx"
        >{{ i + 1 }}</span>
        <span
          v-if="p.name === current"
          class="check"
        >✓</span>
      </li>
    </ul>

    <div class="ft">
      <button
        class="linkbtn"
        @click="openOptions"
      >
        {{ t('popup_optionsShort') || 'Options' }} <span class="key">o</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.popup {
  width: 280px;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: #1f2933;
  background: #fff;
}
.hd {
  padding: 0.6rem 0.9rem;
  border-bottom: 1px solid #e2e7ef;
}
.title {
  font-weight: 700;
}
.warn {
  margin: 0;
  padding: 0.5rem 0.9rem;
  background: #fdecea;
  color: #a23;
  font-size: 0.8rem;
}
.profiles {
  list-style: none;
  margin: 0;
  padding: 0.3rem 0;
  max-height: 380px;
  overflow-y: auto;
}
.profiles li {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.45rem 0.9rem;
  cursor: pointer;
}
.profiles li.hi {
  background: #eef3fd;
}
.profiles li.active {
  font-weight: 600;
}
.dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  flex: none;
}
.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.idx {
  color: #9aa5b5;
  font-size: 0.72rem;
  border: 1px solid #dbe1ea;
  border-radius: 3px;
  padding: 0 0.25rem;
}
.check {
  color: #2f9e58;
}
.ft {
  border-top: 1px solid #e2e7ef;
  padding: 0.45rem 0.9rem;
}
.linkbtn {
  background: none;
  border: none;
  color: #2f6feb;
  cursor: pointer;
  font: inherit;
  padding: 0.2rem 0;
}
.key {
  color: #9aa5b5;
  border: 1px solid #dbe1ea;
  border-radius: 3px;
  padding: 0 0.25rem;
  font-size: 0.72rem;
}
</style>
