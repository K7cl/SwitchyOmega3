<script setup lang="ts">
import { computed, ref } from 'vue'
import { type Profile } from '@switchyomega/omega-pac'
import { useOptionsStore } from '@/ui/store'
import { callBackground } from '@/ui/messaging'
import { t } from '@/ui/i18n'

const props = defineProps<{ profile: Profile }>()
const store = useOptionsStore()

function touch(): void {
  store.touchProfile(props.profile.name)
}

const pacUrl = computed<string>({
  get: () => (props.profile.pacUrl as string) || '',
  set: (v) => {
    props.profile.pacUrl = v
    touch()
  },
})

const pacScript = computed<string>({
  get: () => (props.profile.pacScript as string) || '',
  set: (v) => {
    props.profile.pacScript = v
    touch()
  },
})

const lastUpdate = computed<unknown>(() => props.profile.lastUpdate)

const status = ref<string>('')
const downloading = ref<boolean>(false)
let statusTimer: ReturnType<typeof setTimeout> | undefined

function flash(msg: string): void {
  status.value = msg
  if (statusTimer) clearTimeout(statusTimer)
  statusTimer = setTimeout(() => {
    status.value = ''
  }, 4000)
}

async function updateProfile(): Promise<void> {
  if (downloading.value) return
  downloading.value = true
  status.value = ''
  try {
    await callBackground('updateProfile', props.profile.name)
    flash(t('options_pacScriptLastUpdate') || 'PAC script updated.')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    flash((t('options_pacScriptObsolete') || 'Download failed') + ': ' + message)
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <div>
    <section class="settings-group">
      <h3>{{ t('options_group_pacUrl') || 'PAC URL' }}</h3>
      <input
        v-model="pacUrl"
        type="text"
        class="form-control width-limit"
        placeholder="https://example.com/proxy.pac"
      >
      <p class="help-block">
        {{ t('options_pacUrlHelp') || 'The URL of the PAC file.' }}
      </p>
      <p v-if="pacUrl">
        <button
          class="btn"
          :class="pacUrl && !lastUpdate ? 'btn-primary' : 'btn-default'"
          type="button"
          :disabled="downloading"
          @click="updateProfile"
        >
          <span class="glyphicon glyphicon-download-alt" />
          {{ ' ' }}{{ t('options_downloadProfileNow') || 'Download Profile Now' }}
        </button>
      </p>
    </section>

    <section class="settings-group">
      <h3>{{ t('options_group_pacScript') || 'PAC Script' }}</h3>
      <p
        v-if="pacUrl && lastUpdate"
        class="alert alert-success width-limit"
      >
        {{ t('options_pacScriptLastUpdate') || 'PAC script last updated.' }}
      </p>
      <p
        v-if="pacUrl && !lastUpdate"
        class="alert alert-danger width-limit"
      >
        {{ t('options_pacScriptObsolete') || 'The PAC script is obsolete. Please download it again.' }}
      </p>
      <p
        v-if="status"
        class="help-block"
      >
        {{ status }}
      </p>
      <textarea
        v-model="pacScript"
        class="monospace form-control width-limit"
        rows="20"
        spellcheck="false"
        :disabled="!!pacUrl"
      />
    </section>
  </div>
</template>
