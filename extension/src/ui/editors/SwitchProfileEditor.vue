<script setup lang="ts">
import { computed, ref } from 'vue'
import { type Profile, Switchy } from '@switchyomega/omega-pac'
import { useOptionsStore } from '@/ui/store'
import { callBackground } from '@/ui/messaging'
import { t } from '@/ui/i18n'
import { formatDateTime } from '@/ui/format'
import OmegaProfileSelect from '@/ui/components/OmegaProfileSelect.vue'
import ConditionRow from '@/ui/components/ConditionRow.vue'

interface Rule {
  condition: { conditionType: string; [k: string]: unknown }
  profileName: string
  note?: string
}

const props = defineProps<{ profile: Profile }>()
const store = useOptionsStore()

const rules = computed<Rule[]>(() => props.profile.rules as Rule[])

// == Attached rule list ================================================
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

// Effective default — the attached profile's own default when a rule list is
// attached, otherwise the switch profile's default (never the `__ruleListOf_`).
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
const lastUpdate = computed<string>(() => formatDateTime(attached.value?.lastUpdate as string | undefined))

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
  if (store.setting<boolean>('-confirmDeletion')) {
    const msg = t('options_deleteRuleConfirm') || 'Delete this rule?'
    if (!window.confirm(msg)) return
  }
  rules.value.splice(index, 1)
  touch()
}

function resetRules(): void {
  const msg =
    t('options_resetRules_confirm') ||
    'Set the result of ALL rules to the default profile?'
  if (!window.confirm(msg)) return
  for (const rule of rules.value) {
    rule.profileName = defaultProfileName.value
  }
  touch()
}

// Per-rule notes (revealed by the note button, like the original).
const showNotes = ref<boolean>(rules.value.some((r) => !!r.note))
function addNote(): void {
  showNotes.value = true
}

// == Drag to reorder (replaces up/down buttons; handle = .sort-bar) ====
const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)
function onDragStart(i: number, e: DragEvent): void {
  dragIndex.value = i
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(i))
  }
}
function onDragOver(i: number): void {
  if (dragIndex.value !== null && dragIndex.value !== i) overIndex.value = i
}
function onDrop(i: number): void {
  const from = dragIndex.value
  if (from !== null && from !== i) {
    const list = rules.value
    const [moved] = list.splice(from, 1)
    list.splice(i, 0, moved)
    touch()
  }
  clearDrag()
}
function clearDrag(): void {
  dragIndex.value = null
  overIndex.value = null
}

// == Edit source code ==================================================
const editSource = ref(false)
const source = ref('')
const sourceError = ref('')
function toggleSource(): void {
  if (!editSource.value) {
    source.value = Switchy.compose(
      { rules: rules.value, defaultProfileName: defaultProfileName.value },
      { withResult: true },
    )
    sourceError.value = ''
    editSource.value = true
  } else if (parseSource()) {
    editSource.value = false
  }
}
function parseSource(): boolean {
  try {
    const parsed = Switchy.parseOmega(source.value.trim(), '', '', {
      strict: true,
      source: false,
    }) as Rule[]
    const def = parsed.pop() // trailing `* +default`
    if (def) defaultProfileName.value = def.profileName
    rules.value.splice(0, rules.value.length, ...parsed)
    sourceError.value = ''
    touch()
    return true
  } catch (e) {
    sourceError.value = (e as Error).message || String(e)
    return false
  }
}
</script>

<template>
  <div>
    <section class="settings-group">
      <h3>
        {{ t('options_group_switchRules') || 'Switch rules' }}
        {{ ' ' }}
        <button
          class="btn"
          :class="editSource ? 'btn-primary active' : 'btn-default'"
          :title="t('options_profileEditSource') || 'Edit source code'"
          @click="toggleSource"
        >
          <span class="glyphicon glyphicon-edit" />
          {{ ' ' }}{{ t('options_profileEditSource') || 'Edit source code' }}
        </button>
      </h3>

      <div
        v-if="sourceError"
        class="alert alert-danger width-limit"
      >
        <span class="glyphicon glyphicon-remove" />
        {{ ' ' }}{{ sourceError }}
      </div>

      <!-- Source-code editing mode. -->
      <div
        v-if="editSource"
        class="rules-source"
      >
        <textarea
          v-model="source"
          class="monospace form-control width-limit"
          rows="20"
        />
      </div>

      <!-- Rules table. -->
      <div
        v-else
        class="table-responsive switch-rules-wrapper"
      >
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
              <th v-if="showNotes">
                {{ t('options_ruleNote') || 'Note' }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(rule, index) in rules"
              :key="index"
              class="switch-rule-row"
              :class="{ 'drag-over': overIndex === index, dragging: dragIndex === index }"
              @dragover.prevent="onDragOver(index)"
              @drop="onDrop(index)"
              @dragend="clearDrag"
            >
              <td
                class="sort-bar"
                draggable="true"
                :title="t('options_dragToReorder') || 'Drag to reorder'"
                @dragstart="onDragStart(index, $event)"
              >
                <span class="glyphicon glyphicon-sort" />
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
                  :profile="profile"
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
                {{ ' ' }}
                <button
                  class="btn btn-default btn-sm"
                  :title="t('options_cloneRule') || 'Clone rule'"
                  @click="cloneRule(index)"
                >
                  <span class="glyphicon glyphicon-duplicate" />
                </button>
                <button
                  v-if="!showNotes"
                  class="btn btn-default btn-sm"
                  :title="t('options_ruleNote') || 'Note'"
                  @click="addNote"
                >
                  <span class="glyphicon glyphicon-comment" />
                </button>
              </td>
              <td v-if="showNotes">
                <input
                  v-model="rule.note"
                  class="form-control"
                  @input="touch"
                >
              </td>
            </tr>
          </tbody>
          <tbody>
            <tr>
              <td style="border-right: none;" />
              <td
                style="border-left: none;"
                :colspan="showNotes ? 5 : 4"
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
                  :profile="profile"
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
              <td v-if="showNotes" />
            </tr>
          </tbody>

          <tbody>
            <tr class="switch-default-row">
              <td />
              <td colspan="2">
                {{ t('options_switchDefaultProfile') || 'Default profile' }}
              </td>
              <td>
                <OmegaProfileSelect
                  v-model="defaultProfileName"
                  :profile="profile"
                />
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
              <td v-if="showNotes" />
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
  cursor: grab;
  text-align: center;
  color: #999;
}
.sort-bar:active {
  cursor: grabbing;
}
.switch-rule-row.dragging {
  opacity: 0.4;
}
.switch-rule-row.drag-over td {
  border-top: 2px solid #337ab7;
}
</style>
