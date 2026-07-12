<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { callBackground } from '@/ui/messaging'
import { t, dispName } from '@/ui/i18n'
import OmegaProfileInline from '@/ui/components/OmegaProfileInline.vue'

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

// Current-tab per-domain rule.
const domain = ref('')
const domainRule = ref('')
const tempOpen = ref(false)

const PINNED = ['direct', 'system']
const isPinned = (name: string): boolean => PINNED.includes(name)

const visibleProfiles = computed(() => {
  const list = profiles.value.filter((p) => !p.name.startsWith('__'))
  const rank = (name: string): number => {
    const i = PINNED.indexOf(name)
    return i < 0 ? PINNED.length : i
  }
  // Stable sort keeps user profiles in their existing order, built-ins on top.
  return [...list].sort((a, b) => rank(a.name) - rank(b.name))
})
// Faithful split: built-in profiles (Direct/System) up top, custom below.
const builtinProfiles = computed(() => visibleProfiles.value.filter((p) => isPinned(p.name)))
const customProfiles = computed(() => visibleProfiles.value.filter((p) => !isPinned(p.name)))
const selectedName = computed(() => visibleProfiles.value[selected.value]?.name ?? '')

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

function openOptions(hash?: string): void {
  if (hash) {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/entries/options/index.html') + hash })
  } else {
    chrome.runtime.openOptionsPage()
  }
  window.close()
}

function closePopup(): void {
  window.close()
}

// --- per-domain rule for the current tab ------------------------------------
async function loadPage(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url) return
    const info = await callBackground<{ domain?: string; tempRuleProfileName: string | null }>(
      'getPageInfo',
      { url: tab.url },
    )
    if (info?.domain) {
      domain.value = info.domain
      domainRule.value = info.tempRuleProfileName ?? ''
    }
  } catch {
    /* no accessible tab */
  }
}

async function setDomainRule(name: string): Promise<void> {
  if (!name || !domain.value) return
  domainRule.value = name
  tempOpen.value = false
  await callBackground('addTempRule', domain.value, name)
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id != null) chrome.tabs.reload(tab.id)
  } catch {
    /* ignore */
  }
  setTimeout(() => window.close(), 120)
}

function profileTitle(p: AvailableProfile): string {
  return dispName(p.name)
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
  loadPage()
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
  <!-- Proxy controlled by another program (faithful message screen). -->
  <div
    v-if="proxyNotControllable"
    class="proxy-not-controllable"
  >
    <p class="text-danger">
      {{
        t('popup_proxyNotControllable_' + proxyNotControllable) ||
          t('popup_proxyNotControllable') ||
          'The proxy settings are controlled by another program.'
      }}
    </p>
    <p class="help-block">
      {{
        t('popup_proxyNotControllableDetails_' + proxyNotControllable) ||
          t('popup_proxyNotControllableDetails') ||
          ''
      }}
    </p>
    <p class="proxy-not-controllable-controls">
      <button
        class="btn btn-default"
        @click="closePopup"
      >
        {{ t('dialog_cancel') || 'Cancel' }}
      </button>
      <button
        class="btn btn-primary"
        @click="openOptions()"
      >
        {{ t('popup_proxyNotControllableManage') || 'Manage' }}
      </button>
    </p>
  </div>

  <!-- Faithful popup menu (Bootstrap 3 nav-pills nav-stacked). -->
  <ul
    v-else
    class="popup-menu-nav nav nav-pills nav-stacked"
  >
    <!-- Built-in profiles: Direct / System. -->
    <li
      v-for="p in builtinProfiles"
      :key="p.name"
      class="profile"
      :class="{ active: p.name === current, hi: p.name === selectedName }"
    >
      <a
        role="button"
        :title="profileTitle(p)"
        @click="apply(p.name)"
      >
        <OmegaProfileInline :profile="p" />
      </a>
    </li>

    <li class="divider" />

    <!-- Custom (user) profiles. -->
    <li
      v-for="p in customProfiles"
      :key="p.name"
      class="profile custom-profile"
      :class="{ active: p.name === current, hi: p.name === selectedName }"
    >
      <a
        role="button"
        :title="profileTitle(p)"
        @click="apply(p.name)"
      >
        <OmegaProfileInline :profile="p" />
      </a>
    </li>

    <!-- Per-domain rule for the current tab. -->
    <template v-if="domain">
      <li class="divider" />
      <li
        class="temp-rule"
        :class="{ open: tempOpen }"
      >
        <a
          class="dropdown-toggle"
          role="button"
          @click="tempOpen = !tempOpen"
        >
          <span class="glyphicon glyphicon-filter" />
          {{ ' ' }}
          <span class="current-domain">{{ domain }}</span>
          <span class="caret" />
        </a>
        <ul
          v-show="tempOpen"
          class="dropdown-menu"
        >
          <li
            v-for="p in visibleProfiles"
            :key="p.name"
            :class="{ active: p.name === domainRule }"
          >
            <a
              role="button"
              :title="profileTitle(p)"
              @click="setDomainRule(p.name)"
            >
              <OmegaProfileInline :profile="p" />
            </a>
          </li>
        </ul>
      </li>
    </template>

    <li class="divider" />

    <!-- Open the options page. -->
    <li>
      <a
        role="button"
        @click="openOptions()"
      >
        <span class="glyphicon glyphicon-wrench" />
        {{ ' ' }}
        <span>{{ t('popup_showOptions') || 'Options' }}</span>
      </a>
    </li>
  </ul>
</template>
