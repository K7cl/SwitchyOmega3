<script setup lang="ts">
import { computed } from 'vue'
import { useOptionsStore } from '@/ui/store'
import { t } from '@/ui/i18n'
import { type Profile } from '@switchyomega/omega-pac'
import ProfileSelect from '@/ui/components/ProfileSelect.vue'

const props = defineProps<{ profile: Profile }>()
const store = useOptionsStore()

const target = computed<string>({
  get: () => (props.profile.defaultProfileName as string | undefined) ?? '',
  set: (value: string) => {
    props.profile.defaultProfileName = value
    store.touchProfile(props.profile.name)
  },
})
</script>

<template>
  <div class="card">
    <p>
      {{
        t('options_virtualProfileDesc') ||
          'A virtual profile is a placeholder that forwards to another profile. Point it at a target here so you can repoint it later without editing rules everywhere it is used.'
      }}
    </p>
    <div class="field">
      <label>{{ t('options_virtualProfileTarget') || 'Target profile' }}</label>
      <ProfileSelect
        v-model="target"
        :include-builtin="true"
      />
    </div>
  </div>
</template>

<style scoped>
p {
  margin: 0 0 1rem;
}
</style>
