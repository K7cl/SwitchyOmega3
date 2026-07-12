<script setup lang="ts">
import { computed, ref } from 'vue'
import { useOptionsStore } from '@/ui/store'
import { callBackground } from '@/ui/messaging'
import { t } from '@/ui/i18n'

type SyncState = 'unsupported' | 'pristine' | 'sync' | 'conflict' | undefined

const store = useOptionsStore()

const busy = ref(false)
const error = ref('')

const syncState = computed<SyncState>(
  () => store.state['syncOptions'] as SyncState,
)

const unsupported = computed(() => syncState.value === 'unsupported')

const stateLabel = computed<string>(() => {
  switch (syncState.value) {
    case 'unsupported':
      return t('sync_state_unsupported') || 'Sync is not available in this browser.'
    case 'sync':
      return t('sync_state_sync') || 'Options are being synced across your devices.'
    case 'conflict':
      return (
        t('sync_state_conflict') ||
        'A conflict was detected between local and synced options.'
      )
    case 'pristine':
      return t('sync_state_pristine') || 'Sync is off. Local options are in use.'
    default:
      return t('sync_state_unknown') || 'Sync status is unknown.'
  }
})

async function refresh(): Promise<void> {
  if (store.refreshState) {
    await store.refreshState()
  } else {
    await store.load()
  }
}

async function run(action: () => Promise<unknown>): Promise<void> {
  if (busy.value || unsupported.value) return
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    try {
      await refresh()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
    busy.value = false
  }
}

function enableSync(): Promise<void> {
  return run(() => callBackground('setOptionsSync', true, {}))
}

function enableForce(): Promise<void> {
  return run(() => callBackground('setOptionsSync', true, { force: true }))
}

function disableSync(): Promise<void> {
  return run(() => callBackground('setOptionsSync', false, {}))
}

function resetSync(): Promise<void> {
  return run(() => callBackground('resetOptionsSync'))
}
</script>

<template>
  <div class="card">
    <h2>{{ t('sync_title') || 'Options sync' }}</h2>

    <p class="state">
      {{ stateLabel }}
    </p>

    <p
      v-if="unsupported"
      class="note"
    >
      {{
        t('sync_unavailable_note') ||
          'This browser does not support syncing SwitchyOmega options.'
      }}
    </p>

    <div class="row">
      <button
        class="btn primary"
        :disabled="busy || unsupported"
        @click="enableSync"
      >
        {{ t('sync_enable') || 'Enable sync' }}
      </button>

      <button
        v-if="syncState === 'conflict'"
        class="btn danger"
        :disabled="busy || unsupported"
        @click="enableForce"
      >
        {{ t('sync_enable_force') || 'Enable & overwrite (force)' }}
      </button>

      <button
        class="btn ghost"
        :disabled="busy || unsupported"
        @click="disableSync"
      >
        {{ t('sync_disable') || 'Disable sync' }}
      </button>

      <span class="spacer" />

      <button
        class="btn danger"
        :disabled="busy || unsupported"
        @click="resetSync"
      >
        {{ t('sync_reset') || 'Reset sync storage' }}
      </button>
    </div>

    <p
      v-if="error"
      class="err"
    >
      {{ error }}
    </p>
  </div>
</template>

<style scoped>
.state {
  font-weight: 600;
}

.note {
  opacity: 0.8;
}
</style>
