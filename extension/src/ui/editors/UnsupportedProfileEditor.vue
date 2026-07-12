<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/ui/i18n'
import { type Profile } from '@switchyomega/omega-pac'

const props = defineProps<{ profile: Profile }>()

const rawJson = computed<string>(() => JSON.stringify(props.profile, null, 2))
</script>

<template>
  <div>
    <div class="alert alert-warning">
      <p class="lead">
        {{
          t('options_profileUnsupported', profile.profileType) ||
            'This profile type (' + profile.profileType + ') is not supported and cannot be edited here.'
        }}
      </p>
      <p>
        {{
          t('options_profileUnsupportedHelp') ||
            'Please upgrade SwitchyOmega to the latest version to edit this profile.'
        }}
      </p>
    </div>
    <textarea
      class="form-control monospace"
      rows="15"
      readonly
      :value="rawJson"
    />
  </div>
</template>
