<script setup lang="ts">
import { computed } from 'vue'
import { useOptionsStore } from '@/ui/store'
import { t } from '@/ui/i18n'

const store = useOptionsStore()

interface IntervalOption {
  value: number
  label: string
}

const intervalOptions: IntervalOption[] = [
  { value: 0, label: t('options_downloadIntervalNever') || 'Never' },
  { value: 180, label: t('options_downloadInterval3Hours') || 'Every 3 hours' },
  { value: 720, label: t('options_downloadInterval12Hours') || 'Every 12 hours' },
  { value: 1440, label: t('options_downloadIntervalDaily') || 'Daily' },
  { value: 10080, label: t('options_downloadIntervalWeekly') || 'Weekly' },
]

const downloadInterval = computed<number>({
  get: () => {
    const raw = store.setting<number | undefined>('-downloadInterval')
    return typeof raw === 'number' ? raw : 0
  },
  set: (value) => store.setSetting('-downloadInterval', value),
})
</script>

<template>
  <div class="card">
    <h1>{{ t('options_generalTitle') || 'General' }}</h1>

    <div class="field">
      <label for="general-download-interval">
        {{ t('options_downloadInterval') || 'Profile update interval' }}
      </label>
      <select
        id="general-download-interval"
        v-model.number="downloadInterval"
      >
        <option
          v-for="opt in intervalOptions"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </option>
      </select>
      <p class="hint">
        {{
          t('options_downloadIntervalHelp') ||
            'Rule-list and PAC profiles downloaded from a URL are refreshed ' +
            'automatically at this interval. Choose "Never" to update these ' +
            'profiles only manually.'
        }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.hint {
  margin: 0.375rem 0 0;
  font-size: 0.85rem;
  opacity: 0.75;
}
</style>
