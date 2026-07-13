<script setup lang="ts">
import { ref, computed } from 'vue'
import { useOptionsStore } from '@/ui/store'
import { callBackground } from '@/ui/messaging'
import { t } from '@/ui/i18n'

const store = useOptionsStore()

const restoreOnlineUrl = ref('')
const restoringLocal = ref(false)
const restoringOnline = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const errorMessage = ref('')
const successMessage = ref('')

const syncOptions = computed<string>(() => (store.state['syncOptions'] as string) || 'pristine')

const exportLegacyRuleList = computed<boolean>({
  get: () => Boolean(store.setting<boolean>('-exportLegacyRuleList')),
  set: (v) => store.setSetting('-exportLegacyRuleList', v),
})

const showLegacyOption = computed<boolean>(() => {
  const v = store.setting<number>('-showConditionTypes')
  return !(typeof v === 'number' && v > 0)
})

function clearMessages(): void {
  errorMessage.value = ''
  successMessage.value = ''
}

function importSuccess(): void {
  clearMessages()
  successMessage.value = t('options_importSuccess') || 'Options imported.'
}

function restoreLocalError(): void {
  clearMessages()
  errorMessage.value = t('options_importFormatError') || 'Invalid backup file!'
}

function downloadError(): void {
  clearMessages()
  errorMessage.value = t('options_importDownloadError') || 'Error downloading backup file!'
}

async function exportOptions(): Promise<void> {
  clearMessages()
  try {
    if (store.isDirty) await store.apply()
    const content = JSON.stringify(store.options, null, 2)
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'OmegaOptions.bak'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch {
    downloadError()
  }
}

function triggerFileInput(): void {
  fileInput.value?.click()
}

async function restoreContent(content: string): Promise<void> {
  const parsed = JSON.parse(content) as Record<string, unknown>
  await store.resetToOptions(parsed)
  importSuccess()
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  restoringLocal.value = true
  try {
    const text = await file.text()
    await restoreContent(text)
  } catch {
    restoreLocalError()
  } finally {
    restoringLocal.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function restoreOnline(): Promise<void> {
  clearMessages()
  restoringOnline.value = true
  try {
    const resp = await fetch(restoreOnlineUrl.value, { cache: 'no-store' })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    let text: string
    try {
      text = await resp.text()
    } catch {
      downloadError()
      return
    }
    try {
      await restoreContent(text)
    } catch {
      restoreLocalError()
    }
  } catch {
    downloadError()
  } finally {
    restoringOnline.value = false
  }
}

async function reload(): Promise<void> {
  window.location.reload()
}

async function enableOptionsSync(force = false): Promise<void> {
  try {
    if (!force && store.isDirty) await store.apply()
    await callBackground('setOptionsSync', true, { force })
  } finally {
    await reload()
  }
}

async function disableOptionsSync(): Promise<void> {
  await callBackground('setOptionsSync', false)
  if (store.isDirty) await store.apply()
  await reload()
}

async function resetOptionsSync(): Promise<void> {
  await callBackground('resetOptionsSync')
  if (store.isDirty) await store.apply()
  await reload()
}
</script>

<template>
  <div>
    <div class="page-header">
      <h2>{{ t('options_tab_importExport') || 'Import / Export' }}</h2>
    </div>

    <div
      v-if="errorMessage"
      class="alert alert-danger width-limit"
    >
      {{ errorMessage }}
    </div>
    <div
      v-if="successMessage"
      class="alert alert-success width-limit"
    >
      {{ successMessage }}
    </div>

    <section class="settings-group">
      <h3>{{ t('options_group_importExportProfile') || 'Import / export profiles' }}</h3>
      <div class="help-block">
        <div class="text-info">
          <span class="glyphicon glyphicon-info-sign" />
          {{ t('options_exportProfileHelp') || 'You can export a single profile from the profile page.' }}
        </div>
      </div>
      <div
        v-if="showLegacyOption"
        class="checkbox"
      >
        <label>
          <input
            v-model="exportLegacyRuleList"
            type="checkbox"
          >
          <span>{{ t('options_exportLegacyRuleList') || 'Export in legacy rule list format' }}</span>
        </label>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <p
          class="help-block"
          v-html="t('options_exportLegacyRuleListHelp')"
        />
      </div>
    </section>

    <section class="settings-group">
      <h3>{{ t('options_group_importExportSettings') || 'Import / export settings' }}</h3>
      <p>
        <button
          class="btn btn-default"
          @click="exportOptions"
        >
          <span class="glyphicon glyphicon-floppy-save" />
          {{ t('options_makeBackup') || 'Make a backup' }}
        </button>
        <span class="help-inline">{{ t('options_makeBackupHelp') || 'Export all settings to a file.' }}</span>
      </p>
      <p>
        <input
          id="restore-local-file"
          ref="fileInput"
          type="file"
          accept=".bak,.json,application/json"
          style="display: none"
          @change="onFileChange"
        >
        <button
          class="btn btn-default"
          :disabled="restoringLocal"
          @click="triggerFileInput"
        >
          <span class="glyphicon glyphicon-folder-open" />
          {{ t('options_restoreLocal') || 'Restore from file' }}
        </button>
        <span class="help-inline">{{ t('options_restoreLocalHelp') || 'Restore all settings from a backup file.' }}</span>
      </p>
      <div>
        <label>{{ t('options_restoreOnline') || 'Restore from an online backup' }}</label>
        <div class="input-group width-limit">
          <input
            v-model="restoreOnlineUrl"
            class="form-control"
            type="url"
            :placeholder="t('options_restoreOnlinePlaceholder') || 'URL of the backup file'"
          >
          <span class="input-group-btn">
            <button
              class="btn btn-default"
              :disabled="restoringOnline"
              @click="restoreOnline"
            >
              {{ t('options_restoreOnlineSubmit') || 'Restore' }}
            </button>
          </span>
        </div>
      </div>
    </section>

    <section class="settings-group">
      <h3>{{ t('options_group_syncing') || 'Sync' }}</h3>
      <div v-if="syncOptions === 'pristine' || syncOptions === 'disabled'">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <p
          class="help-block"
          v-html="t('options_syncPristineHelp')"
        />
        <p>
          <button
            class="btn btn-default"
            @click="enableOptionsSync(false)"
          >
            <span class="glyphicon glyphicon-cloud-upload" />
            {{ t('options_syncEnable') || 'Enable sync' }}
          </button>
        </p>
      </div>
      <div v-if="syncOptions === 'sync'">
        <p class="alert alert-success width-limit">
          <span class="glyphicon glyphicon-ok" />
          {{ t('options_syncSyncAlert') || 'Sync is enabled.' }}
        </p>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <p
          class="help-block"
          v-html="t('options_syncSyncHelp')"
        />
        <p>
          <button
            class="btn btn-warning"
            @click="disableOptionsSync"
          >
            <span class="glyphicon glyphicon-remove-sign" />
            {{ t('options_syncDisable') || 'Disable sync' }}
          </button>
        </p>
      </div>
      <div v-if="syncOptions === 'conflict'">
        <p class="alert alert-info width-limit">
          <span class="glyphicon glyphicon-info-sign" />
          {{ t('options_syncConflictAlert') || 'There is a sync conflict.' }}
        </p>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <p
          class="help-block"
          v-html="t('options_syncConflictHelp')"
        />
        <p>
          <button
            class="btn btn-danger"
            @click="enableOptionsSync(true)"
          >
            <span class="glyphicon glyphicon-cloud-download" />
            {{ t('options_syncEnableForce') || 'Use synced options' }}
          </button>
          <button
            class="btn btn-link"
            @click="resetOptionsSync"
          >
            <span class="glyphicon glyphicon-erase" />
            {{ t('options_syncReset') || 'Reset sync' }}
          </button>
        </p>
      </div>
      <div v-if="syncOptions === 'unsupported'">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <p
          class="help-block"
          v-html="t('options_syncUnsupportedHelp')"
        />
      </div>
    </section>
  </div>
</template>
