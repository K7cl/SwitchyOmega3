<script setup lang="ts">
import { ref } from 'vue'
import { useOptionsStore } from '@/ui/store'
import { t } from '@/ui/i18n'
import { callBackground } from '@/ui/messaging'

const store = useOptionsStore()

const version = chrome.runtime.getManifest().version
const issuesUrl = 'https://github.com/K7cl/SwitchyOmega3/issues'
const resetting = ref(false)

async function resetToDefaults(): Promise<void> {
  const message =
    t('options_resetOptionsConfirm') ||
    'Reset all options to their defaults? This cannot be undone.'
  if (!window.confirm(message)) return
  resetting.value = true
  try {
    await callBackground('reset')
    await store.load()
  } finally {
    resetting.value = false
  }
}
</script>

<template>
  <div class="about">
    <h1>Proxy SwitchyOmega</h1>

    <p class="version">
      {{ t('options_version') || 'Version' }}: <strong>{{ version }}</strong>
    </p>

    <p>
      {{
        t('options_aboutDescription') ||
          'Proxy SwitchyOmega lets you quickly manage and switch between multiple proxy configurations.'
      }}
    </p>

    <div class="card">
      <p>
        {{
          t('options_aboutCredits') ||
            'This extension is a Manifest V3 rewrite of the classic SwitchyOmega, rebuilt to work with modern browsers while staying faithful to the original.'
        }}
      </p>
    </div>

    <div class="row">
      <a
        class="btn"
        :href="issuesUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ t('options_reportIssue') || 'Report an issue' }}
      </a>
      <span class="spacer" />
      <button
        class="btn danger"
        :disabled="resetting"
        @click="resetToDefaults"
      >
        {{ t('options_resetOptions') || 'Reset to default options' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.about {
  max-width: 40rem;
}
.version {
  margin: 0 0 1rem;
}
</style>
