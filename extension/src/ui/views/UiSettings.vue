<script setup lang="ts">
import { computed, type WritableComputedRef } from 'vue'
import { useOptionsStore } from '@/ui/store'
import { t, dispName } from '@/ui/i18n'

const store = useOptionsStore()

/** Two-way binding helper for a boolean option stored under `key`. */
function boolSetting(key: string): WritableComputedRef<boolean> {
  return computed<boolean>({
    get: () => store.setting<boolean | undefined>(key) ?? false,
    set: (value) => store.setSetting(key, value),
  })
}

const confirmDeletion = boolSetting('-confirmDeletion')
const refreshOnProfileChange = boolSetting('-refreshOnProfileChange')
const addConditionsToBottom = boolSetting('-addConditionsToBottom')
const enableQuickSwitch = boolSetting('-enableQuickSwitch')

// Startup profile: empty string means "ask" / no fixed startup profile.
const startupProfileName = computed<string>({
  get: () => store.setting<string | undefined>('-startupProfileName') ?? '',
  set: (value) => store.setSetting('-startupProfileName', value),
})

const startupNames = computed<string[]>(() => [
  'direct',
  'system',
  ...store.profiles.map((p) => p.name),
])

// Quick switch profile list (an array of profile names).
const quickSwitchList = computed<string[]>(
  () => store.setting<string[] | undefined>('-quickSwitchProfiles') ?? [],
)

function isQuickSwitch(name: string): boolean {
  return quickSwitchList.value.includes(name)
}

function toggleQuickSwitch(name: string, on: boolean): void {
  const next = quickSwitchList.value.slice()
  const idx = next.indexOf(name)
  if (on && idx < 0) next.push(name)
  else if (!on && idx >= 0) next.splice(idx, 1)
  store.setSetting('-quickSwitchProfiles', next)
}
</script>

<template>
  <section>
    <h1>{{ t('options_interfaceSettings') || 'Interface' }}</h1>

    <div class="field">
      <label class="check">
        <input
          v-model="confirmDeletion"
          type="checkbox"
        >
        {{ t('options_confirmDeletion') || 'Confirm before deleting a profile' }}
      </label>
    </div>

    <div class="field">
      <label class="check">
        <input
          v-model="refreshOnProfileChange"
          type="checkbox"
        >
        {{ t('options_refreshOnProfileChange') || 'Refresh the current tab after switching profile' }}
      </label>
    </div>

    <div class="field">
      <label class="check">
        <input
          v-model="addConditionsToBottom"
          type="checkbox"
        >
        {{ t('options_addConditionsToBottom') || 'Add new conditions to the bottom of the list' }}
      </label>
    </div>

    <div class="field">
      <label class="check">
        <input
          v-model="enableQuickSwitch"
          type="checkbox"
        >
        {{ t('options_enableQuickSwitch') || 'Enable quick switch (cycle profiles from the popup)' }}
      </label>
    </div>

    <div class="field">
      <label>{{ t('options_startupProfile') || 'Startup profile' }}</label>
      <select v-model="startupProfileName">
        <option value="">
          {{ t('options_startupProfileAsk') || '(Ask / none)' }}
        </option>
        <option
          v-for="name in startupNames"
          :key="name"
          :value="name"
        >
          {{ dispName(name) }}
        </option>
      </select>
    </div>

    <div class="field">
      <label>{{ t('options_quickSwitchProfiles') || 'Quick switch profiles' }}</label>
      <div
        v-if="store.profiles.length === 0"
        class="hint"
      >
        {{ t('options_quickSwitchEmpty') || 'No profiles available.' }}
      </div>
      <label
        v-for="p in store.profiles"
        :key="p.name"
        class="check"
      >
        <input
          type="checkbox"
          :checked="isQuickSwitch(p.name)"
          @change="toggleQuickSwitch(p.name, ($event.target as HTMLInputElement).checked)"
        >
        {{ dispName(p.name) }}
      </label>
    </div>
  </section>
</template>

<style scoped>
.check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: normal;
}
.check + .check {
  margin-top: 0.35rem;
}
.hint {
  opacity: 0.7;
  font-size: 0.9em;
}
</style>
