<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useOptionsStore } from '@/ui/store'
import { t } from '@/ui/i18n'
import { showAlert } from '@/ui/alert'
import type { Profile } from '@switchyomega/omega-pac'
import OmegaProfileInline from '@/ui/components/OmegaProfileInline.vue'
import NewProfileModal from '@/ui/components/NewProfileModal.vue'

const store = useOptionsStore()
const route = useRoute()
const router = useRouter()

const showNew = ref(false)

// Type-grouped ordering from the legacy omega_decoration `profileOrder`: sort by
// profile TYPE first (FixedProfile, PacProfile, Virtual, Switch, RuleList; any
// unknown type sorts last), then by name (case-sensitive ascending) for ties.
const PROFILE_TYPE_ORDER: Record<string, number> = {
  FixedProfile: -2000,
  PacProfile: -1000,
  VirtualProfile: 1000,
  SwitchProfile: 2000,
  RuleListProfile: 3000,
}

// Re-sort store.profiles (still the source, so the __-prefixed filter applies).
const orderedProfiles = computed<Profile[]>(() =>
  [...store.profiles].sort((a, b) => {
    const oa = PROFILE_TYPE_ORDER[a.profileType] ?? Number.POSITIVE_INFINITY
    const ob = PROFILE_TYPE_ORDER[b.profileType] ?? Number.POSITIVE_INFINITY
    if (oa !== ob) return oa - ob
    if (a.name === b.name) return 0
    return a.name < b.name ? -1 : 1
  }),
)

// Shape accepted by OmegaProfileInline for rendering the icon/name.
type InlineProfile = { name: string; profileType?: string; color?: unknown }

// For a VirtualProfile, resolve the icon shape + color from the profile it
// points to (following the defaultProfileName chain, guarding against cycles)
// while keeping the virtual profile's own displayed name. Non-virtual profiles
// pass through unchanged; unresolvable targets fall back to the profile itself.
function iconProfile(p: Profile): InlineProfile {
  if (p.profileType !== 'VirtualProfile') return p
  const visited = new Set<string>()
  let target: Profile | undefined = p
  while (target && target.profileType === 'VirtualProfile') {
    if (visited.has(target.name)) {
      target = undefined
      break
    }
    visited.add(target.name)
    target = store.profile(target.defaultProfileName as string)
  }
  if (!target) return p
  return { name: p.name, profileType: target.profileType, color: target.color }
}

const settingTabs = [
  { state: 'ui', icon: 'wrench', key: 'options_tab_ui', fallback: 'Interface' },
  { state: 'general', icon: 'cog', key: 'options_tab_general', fallback: 'General' },
  { state: 'io', icon: 'floppy-save', key: 'options_tab_importExport', fallback: 'Import / Export' },
]

function isActive(path: string): boolean {
  return route.path === '/' + path
}
function isProfileActive(name: string): boolean {
  return route.path === '/profile/' + encodeURIComponent(name)
}

// Apply pending edits and confirm with a toast (the original showAlert success).
// Only announces when there were changes to save.
async function onApply(): Promise<void> {
  if (!store.isDirty) return
  try {
    await store.apply()
    showAlert('success', t('options_saveSuccess') || 'Options saved.')
  } catch (e) {
    showAlert('error', (e as Error)?.message || t('options_saveFailed') || 'Failed to save options.')
  }
}
</script>

<template>
  <header class="col-lg-2 col-sm-3 side-nav">
    <h1>
      <a
        role="button"
        :title="t('about_title') || 'About'"
        @click="router.push('/about')"
      >{{ t('appNameShort') || 'SwitchyOmega' }}</a>
    </h1>

    <ul class="nav nav-pills nav-stacked">
      <li class="nav-header">
        {{ t('options_navHeader_setting') || 'Settings' }}
      </li>
      <li
        v-for="tab in settingTabs"
        :key="tab.state"
        :class="{ active: isActive(tab.state) }"
      >
        <a
          role="button"
          @click="router.push('/' + tab.state)"
        >
          <span
            class="glyphicon"
            :class="'glyphicon-' + tab.icon"
          /> {{ t(tab.key) || tab.fallback }}
        </a>
      </li>

      <li class="divider" />
      <li class="nav-header">
        {{ t('options_navHeader_profiles') || 'Profiles' }}
      </li>
      <li
        v-for="p in orderedProfiles"
        :key="p.name"
        class="nav-profile"
        :class="{ active: isProfileActive(p.name) }"
        :data-profile-type="p.profileType"
      >
        <a
          role="button"
          @click="router.push('/profile/' + encodeURIComponent(p.name))"
        >
          <OmegaProfileInline :profile="iconProfile(p)" />
        </a>
      </li>
      <li class="nav-new-profile">
        <a
          role="button"
          @click="showNew = true"
        >
          <span class="glyphicon glyphicon-plus" /> {{ t('options_newProfile') || 'New profile…' }}
        </a>
      </li>

      <li class="divider" />
      <li class="nav-header">
        {{ t('options_navHeader_actions') || 'Actions' }}
      </li>
      <li>
        <a
          role="button"
          class="btn-default btn align-initial"
          :class="{ 'btn-success': store.isDirty }"
          @click="onApply"
        >
          <span class="glyphicon glyphicon-ok-circle" /> {{ t('options_apply') || 'Apply changes' }}
        </a>
      </li>
      <li :class="{ disabled: !store.isDirty }">
        <a
          role="button"
          class="text-danger"
          @click="store.discard()"
        >
          <span class="glyphicon glyphicon-remove-circle" /> {{ t('options_discard') || 'Discard changes' }}
        </a>
      </li>
    </ul>

    <NewProfileModal
      v-if="showNew"
      @close="showNew = false"
    />
  </header>
</template>
