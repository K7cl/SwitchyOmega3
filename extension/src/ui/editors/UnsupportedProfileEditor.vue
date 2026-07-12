<script setup lang="ts">
import { computed } from 'vue'
import { type Profile } from '@switchyomega/omega-pac'
import { t } from '@/ui/i18n'

const props = defineProps<{ profile: Profile }>()

const raw = computed(() => JSON.stringify(props.profile, null, 2))
</script>

<template>
  <div class="card">
    <p class="err">
      {{
        t('options_unsupportedProfileType') ||
          'This profile type is not editable in this UI.'
      }}
    </p>
    <p class="type-line">
      <strong>{{ t('options_profileType') || 'Profile type' }}:</strong>
      <code>{{ props.profile.profileType }}</code>
    </p>
    <div class="field">
      <label for="unsupported-raw">
        {{ t('options_rawProfileJson') || 'Raw profile data (read-only)' }}
      </label>
      <textarea
        id="unsupported-raw"
        class="raw"
        readonly
        spellcheck="false"
        :value="raw"
      />
    </div>
  </div>
</template>

<style scoped>
.type-line {
  margin: 0 0 1rem;
}
.type-line code {
  font-family: monospace;
}
.raw {
  width: 100%;
  min-height: 20rem;
  font-family: monospace;
  white-space: pre;
  resize: vertical;
}
</style>
