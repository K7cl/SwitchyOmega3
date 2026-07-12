<script setup lang="ts">
import { computed } from 'vue'
import { useOptionsStore } from '@/ui/store'
import { t } from '@/ui/i18n'
import { type Profile } from '@switchyomega/omega-pac'
import ProfileSelect from '@/ui/components/ProfileSelect.vue'
import ConditionRow from '@/ui/components/ConditionRow.vue'

interface Rule {
  condition: { conditionType: string; [k: string]: unknown }
  profileName: string
}

const props = defineProps<{ profile: Profile }>()
const store = useOptionsStore()

const rules = computed<Rule[]>(() => props.profile.rules as Rule[])

const defaultProfileName = computed<string>({
  get: () => (props.profile.defaultProfileName as string) ?? 'direct',
  set: (value: string) => {
    props.profile.defaultProfileName = value
    store.touchProfile(props.profile.name)
  },
})

function touch(): void {
  store.touchProfile(props.profile.name)
}

function addRule(): void {
  const rule: Rule = {
    condition: { conditionType: 'HostWildcardCondition', pattern: '' },
    profileName: 'direct',
  }
  if (store.setting<boolean>('-addConditionsToBottom')) {
    rules.value.push(rule)
  } else {
    rules.value.unshift(rule)
  }
  touch()
}

function deleteRule(index: number): void {
  rules.value.splice(index, 1)
  touch()
}

function swap(a: number, b: number): void {
  const list = rules.value
  if (a < 0 || b < 0 || a >= list.length || b >= list.length) return
  const tmp = list[a]
  list[a] = list[b]
  list[b] = tmp
  touch()
}

function moveUp(index: number): void {
  swap(index, index - 1)
}

function moveDown(index: number): void {
  swap(index, index + 1)
}
</script>

<template>
  <div class="switch-editor">
    <h2>{{ t('options_switchRules') || 'Switch rules' }}</h2>

    <div class="rules card">
      <div
        v-if="rules.length === 0"
        class="empty"
      >
        {{ t('options_noRules') || 'No rules yet. Add one below.' }}
      </div>

      <div
        v-for="(rule, index) in rules"
        :key="index"
        class="rule-row row"
      >
        <div class="rule-condition">
          <ConditionRow
            :condition="rule.condition"
            @change="touch"
          />
        </div>
        <div class="rule-result">
          <ProfileSelect
            v-model="rule.profileName"
            :include-builtin="true"
            @update:model-value="touch"
          />
        </div>
        <div class="rule-actions row">
          <button
            class="btn ghost"
            :disabled="index === 0"
            :title="t('options_moveUp') || 'Move up'"
            @click="moveUp(index)"
          >
            &uarr;
          </button>
          <button
            class="btn ghost"
            :disabled="index === rules.length - 1"
            :title="t('options_moveDown') || 'Move down'"
            @click="moveDown(index)"
          >
            &darr;
          </button>
          <button
            class="btn danger"
            @click="deleteRule(index)"
          >
            {{ t('options_deleteRule') || 'Delete' }}
          </button>
        </div>
      </div>

      <div class="row">
        <button
          class="btn primary"
          @click="addRule"
        >
          {{ t('options_addRule') || 'Add rule' }}
        </button>
      </div>
    </div>

    <div class="field">
      <label>{{ t('options_defaultProfile') || 'Default profile' }}</label>
      <ProfileSelect
        v-model="defaultProfileName"
        :include-builtin="true"
      />
    </div>
  </div>
</template>

<style scoped>
.rule-row {
  align-items: center;
  flex-wrap: wrap;
}
.rule-condition {
  flex: 1 1 320px;
  min-width: 0;
}
.rule-result {
  flex: 0 0 auto;
}
.rule-actions {
  flex: 0 0 auto;
}
.empty {
  opacity: 0.7;
}
</style>
