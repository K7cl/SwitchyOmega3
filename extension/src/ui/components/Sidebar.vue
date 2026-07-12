<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useOptionsStore } from '@/ui/store'
import { t } from '@/ui/i18n'
import OmegaProfileInline from '@/ui/components/OmegaProfileInline.vue'
import NewProfileModal from '@/ui/components/NewProfileModal.vue'

const store = useOptionsStore()
const route = useRoute()
const router = useRouter()

const showNew = ref(false)

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
        v-for="p in store.profiles"
        :key="p.name"
        class="nav-profile"
        :class="{ active: isProfileActive(p.name) }"
        :data-profile-type="p.profileType"
      >
        <a
          role="button"
          @click="router.push('/profile/' + encodeURIComponent(p.name))"
        >
          <OmegaProfileInline :profile="p" />
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
          @click="store.apply()"
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
