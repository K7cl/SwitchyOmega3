<script setup lang="ts">
import { computed, ref } from 'vue'
import { type Profile } from '@switchyomega/omega-pac'
import { useOptionsStore } from '@/ui/store'
import { callBackground } from '@/ui/messaging'
import { t } from '@/ui/i18n'
import OmegaProfileSelect from '@/ui/components/OmegaProfileSelect.vue'

const props = defineProps<{ profile: Profile }>()
const store = useOptionsStore()

const ruleListFormats = ['Switchy', 'AutoProxy']

function touch(): void {
  store.touchProfile(props.profile.name)
}

const matchProfileName = computed<string>({
  get: () => (props.profile.matchProfileName as string) || '',
  set: (v) => {
    props.profile.matchProfileName = v
    touch()
  },
})

const defaultProfileName = computed<string>({
  get: () => (props.profile.defaultProfileName as string) || '',
  set: (v) => {
    props.profile.defaultProfileName = v
    touch()
  },
})

const format = computed<string>({
  get: () => (props.profile.format as string) || 'Switchy',
  set: (v) => {
    props.profile.format = v
    touch()
  },
})

// input-group-clear behaviour: toggle swaps the current value with a stashed one.
const oldSourceUrl = ref<string>('')

const sourceUrl = computed<string>({
  get: () => (props.profile.sourceUrl as string) || '',
  set: (v) => {
    props.profile.sourceUrl = v
    if (v) oldSourceUrl.value = ''
    touch()
  },
})

function toggleClear(): void {
  const current = sourceUrl.value
  props.profile.sourceUrl = oldSourceUrl.value
  oldSourceUrl.value = current
  touch()
}

const ruleList = computed<string>({
  get: () => (props.profile.ruleList as string) || '',
  set: (v) => {
    props.profile.ruleList = v
    touch()
  },
})

const updating = ref<boolean>(false)

async function updateProfile(): Promise<void> {
  if (!sourceUrl.value || updating.value) return
  updating.value = true
  try {
    await callBackground('updateProfile', props.profile.name)
  } finally {
    updating.value = false
  }
}
</script>

<template>
  <div>
    <section class="settings-group">
      <h3>{{ t('options_group_ruleListConfig') || 'Rule List Configuration' }}</h3>
      <div class="form-group">
        <label>{{ t('options_ruleListMatchProfile') || 'When a request matches the rule list, apply this profile:' }}</label>
        {{ ' ' }}
        <OmegaProfileSelect
          v-model="matchProfileName"
          :profile="profile"
          style="display: inline-block;"
        />
      </div>
      <div class="form-group">
        <label>{{ t('options_ruleListDefaultProfile') || 'For all other requests, apply this profile:' }}</label>
        {{ ' ' }}
        <OmegaProfileSelect
          v-model="defaultProfileName"
          :profile="profile"
          style="display: inline-block;"
        />
      </div>
      <form class="form-group">
        <label>{{ t('options_ruleListFormat') || 'Rule List Format' }}</label>
        <div
          v-for="fmt in ruleListFormats"
          :key="fmt"
          class="radio inline-form-control no-min-width"
        >
          <label>
            <input
              v-model="format"
              type="radio"
              name="formatInput"
              :value="fmt"
            >
            {{ t('ruleListFormat_' + fmt) || fmt }}
          </label>
        </div>
      </form>
    </section>
    <section class="settings-group">
      <h3>{{ t('options_group_ruleListUrl') || 'Rule List URL' }}</h3>
      <div class="width-limit">
        <div class="input-group">
          <input
            v-model="sourceUrl"
            type="url"
            class="form-control"
          >
          <span class="input-group-btn">
            <button
              type="button"
              class="btn btn-default input-group-clear-btn"
              :disabled="!sourceUrl && !oldSourceUrl"
              :title="oldSourceUrl ? (t('inputClear_restore') || 'Restore') : (t('inputClear_clear') || 'Clear')"
              @click="toggleClear"
            >
              <span
                class="glyphicon"
                :class="oldSourceUrl ? 'glyphicon-repeat' : 'glyphicon-remove'"
              />
            </button>
          </span>
        </div>
      </div>
      <p class="help-block">
        {{ t('options_ruleListUrlHelp') || 'Set the URL of the rule list to download and use automatically.' }}
      </p>
    </section>
    <section class="settings-group">
      <h3>{{ t('options_group_ruleListText') || 'Rule List Text' }}</h3>
      <p>
        <button
          class="btn btn-default"
          :disabled="!sourceUrl || updating"
          @click="updateProfile"
        >
          <span class="glyphicon glyphicon-download-alt" />
          {{ ' ' }}{{ t('options_downloadProfileNow') || 'Download Now' }}
        </button>
      </p>
      <textarea
        v-model="ruleList"
        class="monospace form-control width-limit"
        rows="20"
        :disabled="!!sourceUrl"
      />
    </section>
  </div>
</template>
