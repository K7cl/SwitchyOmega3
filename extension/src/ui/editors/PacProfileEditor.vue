<script setup lang="ts">
import { ref } from 'vue'
import { useOptionsStore } from '@/ui/store'
import { callBackground } from '@/ui/messaging'
import { t } from '@/ui/i18n'
import { type Profile } from '@switchyomega/omega-pac'

const props = defineProps<{ profile: Profile }>()
const store = useOptionsStore()

const status = ref<string>('')
const downloading = ref<boolean>(false)
let statusTimer: ReturnType<typeof setTimeout> | undefined

function pacUrl(): string {
  return (props.profile.pacUrl as string) || ''
}

function onUrlInput(e: Event): void {
  props.profile.pacUrl = (e.target as HTMLInputElement).value
  store.touchProfile(props.profile.name)
}

function onScriptInput(e: Event): void {
  props.profile.pacScript = (e.target as HTMLTextAreaElement).value
  store.touchProfile(props.profile.name)
}

function flash(msg: string): void {
  status.value = msg
  if (statusTimer) clearTimeout(statusTimer)
  statusTimer = setTimeout(() => {
    status.value = ''
  }, 4000)
}

async function downloadNow(): Promise<void> {
  if (downloading.value) return
  downloading.value = true
  status.value = ''
  try {
    await callBackground('updateProfile', props.profile.name)
    flash(t('options_profileDownloadSuccess') || 'PAC script downloaded.')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    flash((t('options_profileDownloadError') || 'Download failed') + ': ' + message)
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <div class="card">
    <div class="field">
      <label :for="'pac-url-' + profile.name">{{ t('options_profilePacUrl') || 'PAC URL' }}</label>
      <input
        :id="'pac-url-' + profile.name"
        type="url"
        :value="pacUrl()"
        placeholder="https://example.com/proxy.pac"
        @input="onUrlInput"
      >
    </div>

    <div
      v-if="pacUrl()"
      class="row download-row"
    >
      <button
        class="btn primary"
        :disabled="downloading"
        @click="downloadNow"
      >
        {{ t('options_profileDownloadNow') || 'Download now' }}
      </button>
      <span
        v-if="status"
        class="status"
      >{{ status }}</span>
    </div>

    <div class="field">
      <label :for="'pac-script-' + profile.name">
        {{ t('options_profilePacScript') || 'PAC Script' }}
      </label>
      <textarea
        :id="'pac-script-' + profile.name"
        class="script"
        spellcheck="false"
        :value="(profile.pacScript as string) || ''"
        @input="onScriptInput"
      />
      <p
        v-if="pacUrl()"
        class="hint"
      >
        {{
          t('options_profilePacUrlHint') ||
            'A PAC URL is set — the script will be fetched from it on update.'
        }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.download-row {
  align-items: center;
}

.status {
  color: var(--text-muted, #666);
  font-size: 0.9em;
}

.script {
  width: 100%;
  min-height: 16rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre;
}

.hint {
  margin: 0.4rem 0 0;
  color: var(--text-muted, #666);
  font-size: 0.85em;
}
</style>
