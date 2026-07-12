<script setup lang="ts">
import { computed, ref } from 'vue'
import { type Profile } from '@switchyomega/omega-pac'
import { useOptionsStore } from '@/ui/store'
import { callBackground } from '@/ui/messaging'
import { t } from '@/ui/i18n'
import ProfileSelect from '@/ui/components/ProfileSelect.vue'

const props = defineProps<{ profile: Profile }>()
const store = useOptionsStore()

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

const sourceUrl = computed<string>({
  get: () => (props.profile.sourceUrl as string) || '',
  set: (v) => {
    props.profile.sourceUrl = v
    touch()
  },
})

const ruleList = computed<string>({
  get: () => (props.profile.ruleList as string) || '',
  set: (v) => {
    props.profile.ruleList = v
    touch()
  },
})

const downloading = ref(false)
const status = ref('')
let statusTimer: ReturnType<typeof setTimeout> | undefined

function flashStatus(msg: string): void {
  status.value = msg
  if (statusTimer) clearTimeout(statusTimer)
  statusTimer = setTimeout(() => {
    status.value = ''
  }, 4000)
}

async function downloadNow(): Promise<void> {
  if (!sourceUrl.value || downloading.value) return
  downloading.value = true
  status.value = ''
  try {
    await callBackground('updateProfile', props.profile.name)
    flashStatus(t('options_ruleListUpdated') || 'Rule list updated.')
  } catch (e) {
    flashStatus((t('options_ruleListUpdateFailed') || 'Update failed: ') + String(e))
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <div class="rulelist-editor">
    <div class="card">
      <div class="field">
        <label>{{ t('options_ruleListMatchProfile') || 'Match profile' }}</label>
        <ProfileSelect
          v-model="matchProfileName"
          :include-builtin="true"
        />
      </div>
      <div class="field">
        <label>{{ t('options_ruleListDefaultProfile') || 'Default profile' }}</label>
        <ProfileSelect
          v-model="defaultProfileName"
          :include-builtin="true"
        />
      </div>
    </div>

    <div class="card">
      <div class="field">
        <label>{{ t('options_ruleListFormat') || 'Format' }}</label>
        <select v-model="format">
          <option value="Switchy">
            {{ t('options_ruleListFormatSwitchy') || 'Switchy' }}
          </option>
          <option value="AutoProxy">
            {{ t('options_ruleListFormatAutoProxy') || 'AutoProxy' }}
          </option>
        </select>
      </div>
      <div class="field">
        <label>{{ t('options_ruleListSourceUrl') || 'Source URL' }}</label>
        <input
          v-model="sourceUrl"
          type="text"
          placeholder="https://"
        >
      </div>
      <div class="row">
        <button
          class="btn primary"
          :disabled="!sourceUrl || downloading"
          @click="downloadNow"
        >
          {{ downloading ? (t('options_downloading') || 'Downloading…') : (t('options_downloadNow') || 'Download now') }}
        </button>
        <span
          v-if="status"
          class="status"
        >{{ status }}</span>
      </div>
    </div>

    <div class="card">
      <div class="field">
        <label>{{ t('options_ruleList') || 'Rule list' }}</label>
        <textarea
          v-model="ruleList"
          class="rulelist-text"
          rows="16"
          spellcheck="false"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.rulelist-editor {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.rulelist-text {
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  resize: vertical;
}
.status {
  align-self: center;
  opacity: 0.8;
}
</style>
