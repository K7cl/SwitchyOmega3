<script setup lang="ts">
import { computed } from 'vue'
import { useOptionsStore } from '@/ui/store'
import { t, dispName } from '@/ui/i18n'
import { type Profile } from '@switchyomega/omega-pac'
import { callBackground } from '@/ui/messaging'
import OmegaProfileSelect from '@/ui/components/OmegaProfileSelect.vue'

const props = defineProps<{ profile: Profile }>()
const store = useOptionsStore()

const target = computed<string>({
  get: () => (props.profile.defaultProfileName as string | undefined) ?? 'direct',
  set: (value: string) => {
    props.profile.defaultProfileName = value
    store.touchProfile(props.profile.name)
  },
})

const targetDispName = computed<string>(() => dispName(target.value))

async function replaceProfile(): Promise<void> {
  await store.apply()
  await callBackground('replaceRef', target.value, props.profile.name)
}
</script>

<template>
  <div>
    <section class="settings-group">
      <h3>{{ t('options_group_virtualProfile') || 'Virtual Profile' }}</h3>
      <p class="help-block">
        {{
          t('options_virtualProfileTargetHelp') ||
            'The virtual profile does nothing on its own. Instead, it acts as a placeholder for the target profile below.'
        }}
      </p>
      <div class="form-group">
        <label>{{ t('options_virtualProfileTarget') || 'Target profile' }}</label>
        {{ ' ' }}
        <OmegaProfileSelect
          v-model="target"
          :profile="profile"
          class="form-control"
          style="display: inline-block;"
        />
      </div>
    </section>

    <section class="settings-group">
      <h3>{{ t('options_group_virtualProfileReplace') || 'Replace Profile' }}</h3>
      <p class="help-block">
        {{
          t('options_virtualProfileReplaceHelp', [targetDispName]) ||
            'You can replace all references to the target profile with this virtual profile.'
        }}
      </p>
      <div class="form-group">
        <button
          class="btn btn-default"
          @click="replaceProfile"
        >
          <span class="glyphicon glyphicon-search" />
          {{ ' ' }}
          {{ t('options_virtualProfileReplace') || 'Replace references' }}
        </button>
      </div>
    </section>
  </div>
</template>
