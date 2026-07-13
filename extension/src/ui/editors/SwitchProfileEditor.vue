<script setup lang="ts">
import { computed, ref } from 'vue'
import { type Profile } from '@switchyomega/omega-pac'
import { useOptionsStore } from '@/ui/store'
import { callBackground } from '@/ui/messaging'
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

// == Attached rule list ================================================
// A switch profile can have a rule list attached; SwitchyOmega stores it as a
// hidden profile named `__ruleListOf_<switchName>` and points the switch
// profile's defaultProfileName at it. When attached, matched rule-list entries
// resolve to `matchProfileName` and everything else to the attached profile's
// own defaultProfileName.
const attachedName = computed<string>(() => '__ruleListOf_' + props.profile.name)
const attached = computed<Profile | undefined>(() => store.profile(attachedName.value))
const attachedEnabled = computed<boolean>(() => props.profile.defaultProfileName === attachedName.value)
const ruleListFormats = ['Switchy', 'AutoProxy']

function touch(): void {
  store.touchProfile(props.profile.name)
}
function touchAttached(): void {
  store.touchProfile(attachedName.value)
}

// The *effective* default profile — the attached profile's own default when a
// rule list is attached, otherwise the switch profile's default. This is what
// the "Default" row shows (never the internal `__ruleListOf_` name).
const defaultProfileName = computed<string>({
  get: () => {
    if (attachedEnabled.value && attached.value) {
      return (attached.value.defaultProfileName as string) ?? 'direct'
    }
    return (props.profile.defaultProfileName as string) ?? 'direct'
  },
  set: (value: string) => {
    if (attachedEnabled.value && attached.value) {
      attached.value.defaultProfileName = value
      touchAttached()
    } else {
      props.profile.defaultProfileName = value
      touch()
    }
  },
})

const matchProfileName = computed<string>({
  get: () => (attached.value?.matchProfileName as string) ?? 'direct',
  set: (value: string) => {
    if (attached.value) {
      attached.value.matchProfileName = value
      touchAttached()
    }
  },
})

// Checkbox: whether the attached rule list actually decides results.
const attachedInUse = computed<boolean>({
  get: () => attachedEnabled.value,
  set: (enabled: boolean) => {
    if (!attached.value) return
    if (enabled) {
      props.profile.defaultProfileName = attachedName.value
    } else {
      props.profile.defaultProfileName = (attached.value.defaultProfileName as string) ?? 'direct'
    }
    touch()
  },
})

const format = computed<string>({
  get: () => (attached.value?.format as string) || 'Switchy',
  set: (v) => {
    if (attached.value) {
      attached.value.format = v
      touchAttached()
    }
  },
})
const sourceUrl = computed<string>({
  get: () => (attached.value?.sourceUrl as string) || '',
  set: (v) => {
    if (attached.value) {
      attached.value.sourceUrl = v
      touchAttached()
    }
  },
})
const ruleList = computed<string>({
  get: () => (attached.value?.ruleList as string) || '',
  set: (v) => {
    if (attached.value) {
      attached.value.ruleList = v
      touchAttached()
    }
  },
})
const lastUpdate = computed<string>(() => {
  const v = attached.value?.lastUpdate as string | undefined
  return v ? new Date(v).toLocaleString() : ''
})

function attachNew(): void {
  store.addProfile({
    name: attachedName.value,
    profileType: 'RuleListProfile',
    defaultProfileName: (props.profile.defaultProfileName as string) ?? 'direct',
    color: props.profile.color as string,
  })
  props.profile.defaultProfileName = attachedName.value
  touch()
}

function removeAttached(): void {
  const att = attached.value
  if (!att) return
  const msg = t('options_deleteAttachedConfirm') || 'Remove the attached rule list from this profile?'
  if (!window.confirm(msg)) return
  props.profile.defaultProfileName = (att.defaultProfileName as string) ?? 'direct'
  store.deleteProfile(attachedName.value)
  touch()
}

const updating = ref<boolean>(false)
async function downloadNow(): Promise<void> {
  if (!sourceUrl.value || updating.value) return
  updating.value = true
  try {
    await store.apply()
    await callBackground('updateProfile', attachedName.value)
    await store.load()
  } finally {
    updating.value = false
  }
}

// == Rules =============================================================
function addRule(): void {
  const rule: Rule = {
    condition: { conditionType: 'HostWildcardCondition', pattern: '' },
    profileName: defaultProfileName.value,
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

          <!-- Attached rule list row. -->
          <tbody v-if="attached">
            <tr class="switch-attached">
              <td style="border-right: none;">
                <span class="glyphicon glyphicon-list" />
              </td>
              <td style="border-left: none;">
                <span class="checkbox">
                  <label>
                    <input
                      v-model="attachedInUse"
                      type="checkbox"
                    >
                    {{ t('options_switchAttachedProfileInCondition') || 'Rule list' }}
                  </label>
                </span>
              </td>
              <td>
                <span v-if="attachedInUse">
                  {{ t('options_switchAttachedProfileInConditionDetails') ||
                    'Requests matching the rule list use the result profile.' }}
                </span>
                <span v-else>
                  {{ t('options_switchAttachedProfileInConditionDisabled') ||
                    'The rule list is currently disabled.' }}
                </span>
              </td>
              <td>
                <OmegaProfileSelect
                  v-model="matchProfileName"
                  :disabled="!attachedInUse"
                />
              </td>
              <td>
                <button
                  class="btn btn-danger btn-sm"
                  :title="t('options_deleteAttached') || 'Remove rule list'"
                  @click="removeAttached"
                >
                  <span class="glyphicon glyphicon-trash" />
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

    <!-- Attach a rule list (only when none is attached). -->
    <section
      v-if="!attached"
      class="settings-group"
    >
      <h3>{{ t('options_group_attachProfile') || 'Rule list' }}</h3>
      <p class="help-block">
        {{ t('options_attachProfileHelp') ||
          'Attach an online rule list (e.g. GFWList) that automatically decides the result profile.' }}
      </p>
      <button
        class="btn btn-default"
        @click="attachNew"
      >
        <span class="glyphicon glyphicon-plus" />
        {{ ' ' }}{{ t('options_attachProfile') || 'Add a rule list' }}
      </button>
    </section>

    <!-- Rule List Configuration (when attached). -->
    <section
      v-if="attached"
      class="settings-group"
    >
      <h3>{{ t('options_group_ruleListConfig') || 'Rule List Configuration' }}</h3>
      <form>
        <div class="form-group">
          <label>{{ t('options_ruleListFormat') || 'Rule List Format' }}</label>
          <div
            v-for="fmt in ruleListFormats"
            :key="fmt"
            class="radio inline-form-control no-min-width"
          >
            <label>
              <input
                v-model="format"
                type="radio"
                name="formatInput"
                :value="fmt"
              >
              {{ t('ruleListFormat_' + fmt) || fmt }}
            </label>
          </div>
        </div>
        <div class="form-group">
          <label>{{ t('options_group_ruleListUrl') || 'Rule List URL' }}</label>
          <div class="width-limit inline-form-control">
            <input
              v-model="sourceUrl"
              type="url"
              class="form-control"
            >
          </div>
        </div>
      </form>
      <p class="help-block">
        {{ t('options_ruleListUrlHelp') ||
          'Set the URL of the rule list to download and use automatically.' }}
      </p>
      <p>
        <button
          class="btn"
          :class="sourceUrl && !attached.lastUpdate ? 'btn-primary' : 'btn-default'"
          :disabled="!sourceUrl || updating"
          @click="downloadNow"
        >
          <span class="glyphicon glyphicon-download-alt" />
          {{ ' ' }}{{ t('options_downloadProfileNow') || 'Download Now' }}
        </button>
      </p>
    </section>

    <!-- Rule List Text (when attached). -->
    <section
      v-if="attached"
      class="settings-group"
    >
      <h3>{{ t('options_group_ruleListText') || 'Rule List Text' }}</h3>
      <p
        v-if="sourceUrl && lastUpdate"
        class="alert alert-success width-limit"
      >
        {{ t('options_ruleListLastUpdate', [lastUpdate]) || ('Last updated: ' + lastUpdate) }}
      </p>
      <p
        v-else-if="sourceUrl && !lastUpdate"
        class="alert alert-danger width-limit"
      >
        {{ t('options_ruleListObsolete') || 'This rule list has not been downloaded yet.' }}
      </p>
      <textarea
        v-model="ruleList"
        class="monospace form-control width-limit"
        rows="20"
        :disabled="!!sourceUrl"
      />
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
