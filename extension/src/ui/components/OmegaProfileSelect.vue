<script setup lang="ts">
import { computed } from 'vue'
import { dispName } from '@/ui/i18n'
import { useOptionsStore } from '@/ui/store'
import { type Profile } from '@switchyomega/omega-pac'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const store = useOptionsStore()

const options = computed<string[]>(() => [
  'direct',
  'system',
  ...store.profiles.map((p: Profile) => p.name),
])

function onChange(event: Event) {
  emit('update:modelValue', (event.target as HTMLSelectElement).value)
}
</script>

<template>
  <select
    class="form-control"
    :value="props.modelValue"
    @change="onChange"
  >
    <option
      v-for="name in options"
      :key="name"
      :value="name"
    >
      {{ dispName(name) }}
    </option>
  </select>
</template>
