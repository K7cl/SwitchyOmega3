<script setup lang="ts">
import { computed } from 'vue'
import { type Profile } from '@switchyomega/omega-pac'
import { useOptionsStore } from '@/ui/store'
import { t } from '@/ui/i18n'
import OmegaProfileSelect from '@/ui/components/OmegaProfileSelect.vue'
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
    touch()
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

function cloneRule(index: number): void {
  const copy = JSON.parse(JSON.stringify(rules.value[index])) as Rule
  rules.value.splice(index + 1, 0, copy)
  touch()
}

function removeRule(index: number): void {
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

function resetRules(): void {
  for (const rule of rules.value) {
    rule.profileName = defaultProfileName.value
  }
  touch()
}
</script>

<template>
  <div>
    <section class="settings-group">
      <h3>{{ t('options_group_switchRules') || 'Switch rules' }}</h3>

      <div class="table-responsive switch-rules-wrapper">
        <table class="switch-rules table table-bordered table-condensed width-limit-xl">
          <thead>
            <tr>
              <th style="white-space: nowrap">
                {{ t('options_sort') || 'Sort' }}
              </th>
              <th class="condition-type-th">
                {{ t('options_conditionType') || 'Condition Type' }}
              </th>
              <th>{{ t('options_conditionDetails') || 'Condition Details' }}</th>
              <th>{{ t('options_resultProfile') || 'Result Profile' }}</th>
              <th>{{ t('options_conditionActions') || 'Actions' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(rule, index) in rules"
              :key="index"
              class="switch-rule-row"
            >
              <td class="sort-bar">
                <button
                  class="btn btn-default btn-sm"
                  :disabled="index === 0"
                  :title="t('options_moveUp') || 'Move up'"
                  @click="moveUp(index)"
                >
                  <span class="glyphicon glyphicon-chevron-up" />
                </button>
                <button
                  class="btn btn-default btn-sm"
                  :disabled="index === rules.length - 1"
                  :title="t('options_moveDown') || 'Move down'"
                  @click="moveDown(index)"
                >
                  <span class="glyphicon glyphicon-chevron-down" />
                </button>
              </td>
              <td colspan="2">
                <ConditionRow
                  :condition="rule.condition"
                  @change="touch"
                />
              </td>
              <td class="switch-rule-row-target">
                <OmegaProfileSelect
                  v-model="rule.profileName"
                  @update:model-value="touch"
                />
              </td>
              <td>
                <button
                  class="btn btn-danger btn-sm"
                  :title="t('options_deleteRule') || 'Delete rule'"
                  @click="removeRule(index)"
                >
                  <span class="glyphicon glyphicon-trash" />
                </button>
                <button
                  class="btn btn-default btn-sm"
                  :title="t('options_cloneRule') || 'Clone rule'"
                  @click="cloneRule(index)"
                >
                  <span class="glyphicon glyphicon-duplicate" />
                </button>
              </td>
            </tr>
          </tbody>
          <tbody>
            <tr>
              <td style="border-right: none;" />
              <td
                style="border-left: none;"
                colspan="4"
              >
                <button
                  class="btn btn-default btn-sm"
                  @click="addRule"
                >
                  <span class="glyphicon glyphicon-plus" />
                  <span>{{ t('options_addCondition') || 'Add condition' }}</span>
                </button>
              </td>
            </tr>
          </tbody>
          <tbody>
            <tr class="switch-default-row">
              <td />
              <td colspan="2">
                {{ t('options_switchDefaultProfile') || 'Default profile' }}
              </td>
              <td>
                <OmegaProfileSelect v-model="defaultProfileName" />
              </td>
              <td>
                <button
                  class="btn btn-info btn-sm"
                  :title="t('options_resetRules_help') || 'Set all rules to the default profile'"
                  @click="resetRules"
                >
                  <span class="glyphicon glyphicon-chevron-up" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sort-bar {
  white-space: nowrap;
}
.sort-bar .btn + .btn {
  margin-left: 2px;
}
</style>
