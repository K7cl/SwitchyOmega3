<script setup lang="ts">
import { ref } from 'vue'
import { useOptionsStore } from '@/ui/store'
import { t } from '@/ui/i18n'

const store = useOptionsStore()

const message = ref('')
const isError = ref(false)
const restoreUrl = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

function setStatus(text: string, error: boolean): void {
  message.value = text
  isError.value = error
}

function exportOptions(): void {
  try {
    const json = JSON.stringify(store.options, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'OmegaOptions.bak'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setStatus(t('io_exportSuccess') || 'Options exported.', false)
  } catch (e) {
    setStatus((t('io_exportError') || 'Failed to export options: ') + String(e), true)
  }
}

async function restoreParsed(parsed: unknown): Promise<void> {
  if (!window.confirm(t('io_restoreConfirm') || 'This will replace all current options. Continue?')) {
    return
  }
  await store.resetToOptions(parsed as Record<string, unknown>)
  setStatus(t('io_restoreSuccess') || 'Options restored.', false)
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const parsed: unknown = JSON.parse(text)
    await restoreParsed(parsed)
  } catch (e) {
    setStatus((t('io_restoreError') || 'Failed to restore options: ') + String(e), true)
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function restoreFromUrl(): Promise<void> {
  const url = restoreUrl.value.trim()
  if (!url) {
    setStatus(t('io_urlRequired') || 'Please enter a URL.', true)
    return
  }
  try {
    const resp = await fetch(url)
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`)
    }
    const parsed: unknown = await resp.json()
    await restoreParsed(parsed)
  } catch (e) {
    setStatus((t('io_restoreError') || 'Failed to restore options: ') + String(e), true)
  }
}
</script>

<template>
  <div class="import-export">
    <h1>{{ t('io_title') || 'Import / Export' }}</h1>

    <p
      v-if="message"
      :class="{ err: isError }"
    >
      {{ message }}
    </p>

    <div class="card">
      <h2>{{ t('io_exportTitle') || 'Export' }}</h2>
      <p>{{ t('io_exportDesc') || 'Download a backup file of all your options.' }}</p>
      <div class="row">
        <button
          class="btn primary"
          @click="exportOptions"
        >
          {{ t('io_exportButton') || 'Export' }}
        </button>
      </div>
    </div>

    <div class="card">
      <h2>{{ t('io_restoreFileTitle') || 'Restore from file' }}</h2>
      <p>{{ t('io_restoreFileDesc') || 'Restore options from a previously exported backup file.' }}</p>
      <div class="field">
        <label>{{ t('io_restoreFileLabel') || 'Backup file' }}</label>
        <input
          ref="fileInput"
          type="file"
          accept=".bak,application/json"
          @change="onFileChange"
        >
      </div>
    </div>

    <div class="card">
      <h2>{{ t('io_restoreUrlTitle') || 'Restore from URL' }}</h2>
      <p>{{ t('io_restoreUrlDesc') || 'Fetch and restore options from a URL.' }}</p>
      <div class="field">
        <label>{{ t('io_restoreUrlLabel') || 'URL' }}</label>
        <input
          v-model="restoreUrl"
          type="text"
          placeholder="https://example.com/OmegaOptions.bak"
        >
      </div>
      <div class="row">
        <button
          class="btn primary"
          @click="restoreFromUrl"
        >
          {{ t('io_restoreUrlButton') || 'Restore from URL' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.import-export .card {
  margin-bottom: 1rem;
}
</style>
