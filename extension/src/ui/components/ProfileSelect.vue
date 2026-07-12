<script setup lang="ts">
import { computed } from 'vue'
import { useOptionsStore } from '@/ui/store'
import { dispName } from '@/ui/i18n'

const props = withDefaults(
  defineProps<{ modelValue: string; includeBuiltin?: boolean }>(),
  { includeBuiltin: true },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const store = useOptionsStore()

const names = computed<string[]>(() => {
  const list = store.profiles.map((p) => p.name)
  if (props.includeBuiltin) return ['direct', 'system', ...list]
  return list
})

function onChange(e: Event): void {
  emit('update:modelValue', (e.target as HTMLSelectElement).value)
}
</script>

<template>
  <select
    :value="modelValue"
    @change="onChange"
  >
    <option
      v-for="name in names"
      :key="name"
      :value="name"
    >
      {{ dispName(name) }}
    </option>
  </select>
</template>
