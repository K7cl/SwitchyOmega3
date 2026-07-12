<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useOptionsStore } from '@/ui/store'
import { t, dispName } from '@/ui/i18n'

const store = useOptionsStore()
const router = useRouter()

const settingsLinks = [
  { path: '/ui', key: 'options_tabItem_ui', fallback: 'Interface' },
  { path: '/general', key: 'options_tabItem_general', fallback: 'General' },
  { path: '/io', key: 'options_tabItem_importExport', fallback: 'Import / Export' },
  { path: '/sync', key: 'options_group_sync', fallback: 'Options Sync' },
  { path: '/about', key: 'options_tabItem_about', fallback: 'About' },
]

const PROFILE_TYPES = [
  { type: 'FixedProfile', label: 'Proxy profile' },
  { type: 'SwitchProfile', label: 'Auto Switch' },
  { type: 'PacProfile', label: 'PAC profile' },
  { type: 'RuleListProfile', label: 'Rule list' },
  { type: 'VirtualProfile', label: 'Virtual profile' },
]

const creating = ref(false)
const newName = ref('')
const newType = ref('FixedProfile')
const createError = ref('')

function startCreate(): void {
  creating.value = true
  newName.value = ''
  newType.value = 'FixedProfile'
  createError.value = ''
}

function confirmCreate(): void {
  const name = newName.value.trim()
  if (!name) {
    createError.value = t('dialog_error_profileName') || 'Please enter a name.'
    return
  }
  if (store.profile(name) || name === 'direct' || name === 'system') {
    createError.value = t('dialog_error_profileNameUsed') || 'That name is already taken.'
    return
  }
  const extra: Record<string, unknown> = { color: '#77b1eb' }
  if (newType.value === 'VirtualProfile') extra.defaultProfileName = 'direct'
  store.addProfile({ name, profileType: newType.value, ...extra })
  creating.value = false
  router.push('/profile/' + encodeURIComponent(name))
}
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      Proxy SwitchyOmega
    </div>

    <nav class="nav">
      <div class="nav-title">
        {{ t('options_group_settings') || 'Settings' }}
      </div>
      <RouterLink
        v-for="l in settingsLinks"
        :key="l.path"
        :to="l.path"
        class="nav-item"
      >
        {{ t(l.key) || l.fallback }}
      </RouterLink>
    </nav>

    <nav class="nav">
      <div class="nav-title">
        {{ t('options_group_profiles') || 'Profiles' }}
      </div>
      <RouterLink
        v-for="p in store.profiles"
        :key="p.name"
        :to="'/profile/' + encodeURIComponent(p.name)"
        class="nav-item profile"
      >
        <span
          class="dot"
          :style="{ background: (p.color as string) || '#888' }"
        />
        <span class="pname">{{ dispName(p.name) }}</span>
        <span
          v-if="p.name === store.currentProfileName"
          class="current"
          :title="t('popup_currentProfile') || 'Current'"
        >●</span>
        <button
          class="apply-mini"
          :title="t('popup_applyProfile') || 'Apply'"
          @click.prevent.stop="store.applyProfile(p.name)"
        >
          ▶
        </button>
      </RouterLink>
    </nav>

    <div class="new-profile">
      <button
        v-if="!creating"
        class="btn primary full"
        @click="startCreate"
      >
        + {{ t('options_newProfile') || 'New profile' }}
      </button>
      <div
        v-else
        class="create-form card"
      >
        <input
          v-model="newName"
          type="text"
          :placeholder="t('options_modalNewProfileName') || 'Profile name'"
          @keyup.enter="confirmCreate"
        >
        <select v-model="newType">
          <option
            v-for="pt in PROFILE_TYPES"
            :key="pt.type"
            :value="pt.type"
          >
            {{ pt.label }}
          </option>
        </select>
        <p
          v-if="createError"
          class="err"
        >
          {{ createError }}
        </p>
        <div class="row">
          <button
            class="btn"
            @click="creating = false"
          >
            {{ t('dialog_cancel') || 'Cancel' }}
          </button>
          <button
            class="btn primary"
            @click="confirmCreate"
          >
            {{ t('dialog_ok') || 'Create' }}
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  background: #2b3444;
  color: #d8dee9;
  padding: 1.25rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.brand {
  font-weight: 700;
  font-size: 1.05rem;
  color: #fff;
  padding: 0 0.5rem;
}
.nav-title {
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  color: #8794a8;
  margin: 0.25rem 0.5rem;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  color: #d8dee9;
  text-decoration: none;
  font-size: 0.9rem;
}
.nav-item:hover {
  background: #3a4557;
}
.nav-item.router-link-active {
  background: var(--so-accent);
  color: #fff;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
}
.pname {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.current {
  color: #7bd88f;
  font-size: 0.7rem;
}
.apply-mini {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  opacity: 0.5;
  font-size: 0.7rem;
}
.apply-mini:hover {
  opacity: 1;
}
.btn.full {
  width: 100%;
}
.create-form input,
.create-form select {
  margin-bottom: 0.5rem;
}
.err {
  color: #ffb4b4;
  font-size: 0.8rem;
  margin: 0 0 0.5rem;
}
</style>
