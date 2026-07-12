<script setup lang="ts">
import { useOptionsStore } from '@/ui/store'
import { callBackground, getState } from '@/ui/messaging'
import { t } from '@/ui/i18n'

const store = useOptionsStore()

// Packaged asset served from the extension root; resolve to an absolute
// extension URL so it works regardless of the options page's built path.
const iconUrl = chrome.runtime.getURL('img/icons/omega-action-32.png')

let version = '?.?.?'
try {
  version = chrome.runtime.getManifest().version
} catch {
  version = '?.?.?'
}

function reportIssue(): void {
  window.open('https://github.com/K7cl/SwitchyOmega3/issues', '_blank')
}

async function downloadLog(): Promise<void> {
  let log = ''
  try {
    const state = await getState<{ log?: string }>(['log'])
    log = state?.log ?? ''
  } catch {
    // No stored log available; fall back to the empty default.
  }
  const blob = new Blob([log], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `OmegaLog_${Date.now()}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function showResetOptionsModal(): Promise<void> {
  const message =
    t('options_resetConfirm') ||
    'Are you sure you want to reset all options to their default values?'
  if (!window.confirm(message)) return
  await callBackground('reset')
  await store.load()
}
</script>

<template>
  <div>
    <div class="page-header">
      <h2>{{ t('about_title') || 'About' }}</h2>
    </div>

    <section>
      <div
        class="media"
        style="margin: 1em 0"
      >
        <div class="media-left">
          <img
            class="media-object"
            :src="iconUrl"
          >
        </div>
        <div class="media-body">
          <h4 class="media-heading">
            {{ t('appNameShort') || 'SwitchyOmega' }}
          </h4>
          <p>{{ t('about_app_description') || 'Manage and switch between multiple proxies quickly &amp; easily.' }}</p>
        </div>
      </div>
    </section>

    <section>
      <p>
        <button
          class="btn btn-info"
          @click="reportIssue"
        >
          <span class="glyphicon glyphicon-comment" />
          {{ ' ' }}{{ t('popup_reportIssues') || 'Report issues' }}
        </button>
        {{ ' ' }}
        <button
          class="btn btn-default"
          @click="downloadLog"
        >
          <span class="glyphicon glyphicon-download" />
          {{ ' ' }}{{ t('popup_errorLog') || 'Error log' }}
        </button>
        {{ ' ' }}
        <button
          class="btn btn-danger"
          @click="showResetOptionsModal"
        >
          <span class="glyphicon glyphicon-alert" />
          {{ ' ' }}{{ t('options_reset') || 'Reset all options' }}
        </button>
      </p>
    </section>

    <section>
      <p>{{ t('about_version', [version]) || ('Version ' + version) }}</p>
      <p class="text-warning">
        <span class="glyphicon glyphicon-info-sign" />
        {{ ' ' }}<span v-html="t('about_disclaimer_networkService')" />
      </p>
      <p class="text-success">
        <span class="glyphicon glyphicon-eye-close" />
        {{ ' ' }}<span v-html="t('about_disclaimer_privacy')" />
      </p>
      <p class="text-info">
        <span class="glyphicon glyphicon-question-sign" />
        {{ ' ' }}<span v-html="t('about_help')" />
      </p>
    </section>

    <section style="margin-top: 7em">
      <p>
        {{ t('appNameShort') || 'SwitchyOmega' }}
        <br>
        <span v-html="t('about_copyright')" />
        <br>
        <span v-html="t('about_license')" />
        <br>
        <span v-html="t('about_credits')" />
      </p>
    </section>
  </div>
</template>
