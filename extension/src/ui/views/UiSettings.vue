<script setup lang="ts">
import { computed, type WritableComputedRef } from 'vue'
import { useOptionsStore } from '@/ui/store'
import { t, dispName } from '@/ui/i18n'
import OmegaProfileInline from '@/ui/components/OmegaProfileInline.vue'
import OmegaProfileSelect from '@/ui/components/OmegaProfileSelect.vue'

const store = useOptionsStore()

/** Writable proxy for a plain boolean setting stored under `key`. */
function boolSetting(key: string): WritableComputedRef<boolean> {
  return computed<boolean>({
    get: () => !!store.setting(key),
    set: (value) => store.setSetting(key, value),
  })
}

const confirmDeletion = boolSetting('-confirmDeletion')
const refreshOnProfileChange = boolSetting('-refreshOnProfileChange')
const showInspectMenu = boolSetting('-showInspectMenu')
const addConditionsToBottom = boolSetting('-addConditionsToBottom')
const enableQuickSwitch = boolSetting('-enableQuickSwitch')

// `-showInspectMenu` is not present in every options version; only render it
// when the setting exists (matches the original's conditional presence).
const hasShowInspectMenu = computed<boolean>(
  () => '-showInspectMenu' in store.options,
)

// Original stores this as the numeric values 1 / 0 (ng-true-value / -false-value).
const showConditionTypes = computed<boolean>({
  get: () => store.setting('-showConditionTypes') == 1,
  set: (value) => store.setSetting('-showConditionTypes', value ? 1 : 0),
})

// Startup profile: empty string means "(Current profile)".
const startupProfileName = computed<string>({
  get: () => (store.setting<string>('-startupProfileName') as string) || '',
  set: (value) => store.setSetting('-startupProfileName', value),
})

// Candidate profiles, built-ins first, matching the original `profiles:"all"`.
const profileNames = computed<string[]>(() => [
  'direct',
  'system',
  ...store.profiles.map((p) => p.name),
])

const quickSwitchProfiles = computed<string[]>(
  () => (store.setting<string[]>('-quickSwitchProfiles') as string[]) || [],
)

function isCycled(name: string): boolean {
  return quickSwitchProfiles.value.indexOf(name) >= 0
}

function toggleCycled(name: string): void {
  const list = quickSwitchProfiles.value.slice()
  const idx = list.indexOf(name)
  if (idx >= 0) list.splice(idx, 1)
  else list.push(name)
  store.setSetting('-quickSwitchProfiles', list)
}

function openShortcutConfig(): void {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })
}
</script>

<template>
  <div>
    <div class="page-header">
      <h2>{{ t('options_tab_ui') || 'Interface' }}</h2>
    </div>

    <section class="settings-group">
      <h3>{{ t('options_group_miscOptions') || 'Misc Options' }}</h3>
      <div class="checkbox">
        <label>
          <input
            v-model="confirmDeletion"
            type="checkbox"
          >
          <span>{{ t('options_confirmDeletion') || 'Confirm on condition deletion.' }}</span>
        </label>
      </div>
      <div class="checkbox">
        <label>
          <input
            id="refresh-on-profile-change"
            v-model="refreshOnProfileChange"
            type="checkbox"
          >
          <span>{{ t('options_refreshOnProfileChange') || 'Refresh current tab on profile change.' }}</span>
        </label>
      </div>
      <div
        v-if="hasShowInspectMenu"
        class="checkbox"
      >
        <label>
          <input
            v-model="showInspectMenu"
            type="checkbox"
          >
          <span>{{ t('options_showInspectMenu') || 'Allow inspecting proxy used for page elements via context menu.' }}</span>
        </label>
      </div>
      <div class="checkbox">
        <label>
          <input
            v-model="addConditionsToBottom"
            type="checkbox"
          >
          <span>{{ t('options_addConditionsToBottom') || 'Put new conditions added using the popup to the bottom of the list.' }}</span>
        </label>
      </div>
    </section>

    <section class="settings-group">
      <h3>{{ t('options_group_keyboardShortcut') || 'Keyboard Shortcut' }}</h3>
      <p>
        <button
          type="button"
          role="button"
          class="btn btn-default"
          @click="openShortcutConfig"
        >
          <span class="glyphicon glyphicon-share-alt" />
          {{ ' ' }}{{ t('options_menuShortcutConfigure') || 'Configure shortcut' }}
        </button>
        {{ ' ' }}{{ t('options_menuShortcutHelp') || 'Pressing the shortcut will open the switch popup menu. (Defaults to Alt+Shift+O).' }}
      </p>
      <p class="help-block">
        {{ t('options_menuShortcutMore') || 'The items in the popup menu can also be accessed using the keyboard. Press ? (or /) in the menu to learn more.' }}
      </p>
    </section>

    <section class="settings-group">
      <h3>{{ t('options_group_switchOptions') || 'Switch Options' }}</h3>
      <div class="form-group">
        <label>{{ t('options_startupProfile') || 'Startup Profile' }}</label>
        {{ ' ' }}
        <OmegaProfileSelect
          v-model="startupProfileName"
          :default-text="t('options_startupProfile_none') || '(Current profile)'"
          style="display: inline-block;"
        />
      </div>
      <div class="checkbox">
        <label>
          <input
            v-model="showConditionTypes"
            type="checkbox"
          >
          <span>{{ t('options_showConditionTypesAdvanced') || 'Show advanced condition types' }}</span>
        </label>
        <p class="help-block">
          {{ t('options_showConditionTypesAdvancedHelp') || 'Unlocks new types of advanced but complicated switch conditions. For most scenarios, the basic condition types should be enough, so this option is not recommended.' }}
        </p>
      </div>
      <div class="checkbox">
        <label>
          <input
            v-model="enableQuickSwitch"
            type="checkbox"
          >
          <span>{{ t('options_quickSwitch') || 'Quick Switch' }}</span>
        </label>
      </div>

      <div
        v-show="enableQuickSwitch"
        id="quick-switch-settings"
        class="settings-group"
      >
        <h4>{{ t('options_cycledProfiles') || 'Cycled Profiles' }}</h4>
        <p class="help-block">
          {{ t('options_cycledProfilesHelp') || 'When you click on the icon (or use the shortcut above), the following profiles will be applied in their order.' }}
        </p>
        <div
          v-show="quickSwitchProfiles.length < 2"
          class="has-error"
        >
          <p class="help-block">
            {{ t('options_cycledProfilesTooFew') || 'You need to select at least 2 profiles to enable this function! You can drag them from the box below.' }}
          </p>
        </div>
        <div
          v-for="name in profileNames"
          :key="name"
          class="checkbox"
        >
          <label>
            <input
              type="checkbox"
              :checked="isCycled(name)"
              @change="toggleCycled(name)"
            >
            <OmegaProfileInline
              v-if="store.profile(name)"
              :profile="store.profile(name)!"
            />
            <span v-else>{{ dispName(name) }}</span>
          </label>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.omega-profile-inline {
  vertical-align: middle;
}
</style>
