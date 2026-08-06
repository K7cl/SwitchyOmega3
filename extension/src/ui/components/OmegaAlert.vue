<script setup lang="ts">
import { computed } from 'vue'
import { useAlert, hideAlert, type AlertType } from '@/ui/alert'

const alert = useAlert()

// Faithful glyphicon mapping from the original alertIcons.
const ICONS: Record<AlertType, string> = {
  success: 'glyphicon-ok',
  warning: 'glyphicon-warning-sign',
  error: 'glyphicon-remove',
  info: 'glyphicon-info-sign',
}
// Bootstrap alert contextual classes; the original maps 'error' -> 'danger'.
const alertClass = computed(() => 'alert-' + (alert.type === 'error' ? 'danger' : alert.type))
const iconClass = computed(() => ICONS[alert.type] ?? 'glyphicon-info-sign')
</script>

<template>
  <div
    class="alert-top-wrapper"
    :class="{ 'ng-hide': !alert.shown }"
  >
    <div
      class="alert alert-dismissible"
      :class="alertClass"
      role="alert"
    >
      <button
        type="button"
        class="close"
        :aria-label="'Close'"
        @click="hideAlert"
      >
        <span aria-hidden="true">&times;</span>
      </button>
      <span
        class="glyphicon"
        :class="iconClass"
      />
      {{ ' ' }}
      <span>{{ alert.message }}</span>
    </div>
  </div>
</template>
