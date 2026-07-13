<script setup lang="ts">
import { computed } from 'vue'
import { Conditions, type Condition } from '@switchyomega/omega-pac'
import { t } from '@/ui/i18n'

const props = defineProps<{
  condition: Condition
}>()

// Emitted whenever the condition mutates so the parent can mark the profile
// dirty (parent wires `@change="touch"`).
const emit = defineEmits<{ (e: 'change'): void }>()

// Condition types grouped exactly like the original AngularJS options page
// (advancedConditionTypes). TrueCondition is intentionally NOT offered here.
const conditionGroups: { key: string; types: string[] }[] = [
  {
    key: 'host',
    types: [
      'HostWildcardCondition',
      'HostRegexCondition',
      'HostLevelsCondition',
      'IpCondition',
    ],
  },
  {
    key: 'url',
    types: ['UrlWildcardCondition', 'UrlRegexCondition', 'KeywordCondition'],
  },
  {
    key: 'special',
    types: ['WeekdayCondition', 'TimeCondition', 'FalseCondition'],
  },
]

const groupFallback: Record<string, string> = {
  host: 'Host',
  url: 'URL',
  special: 'Special',
}

const typeFallback: Record<string, string> = {
  HostWildcardCondition: 'Host wildcard',
  HostRegexCondition: 'Host regex',
  HostLevelsCondition: 'Host levels',
  IpCondition: 'IP',
  UrlWildcardCondition: 'URL wildcard',
  UrlRegexCondition: 'URL regex',
  KeywordCondition: 'Keyword',
  WeekdayCondition: 'Day of week',
  TimeCondition: 'Time',
  FalseCondition: 'Disabled',
  TrueCondition: 'Always',
}

// All types offered in the dropdown, used to detect an "unknown" current type
// (e.g. a loaded TrueCondition) that still needs to render without breaking.
const knownTypes = new Set(conditionGroups.flatMap((g) => g.types))

const patternTypes = new Set([
  'HostWildcardCondition',
  'HostRegexCondition',
  'UrlWildcardCondition',
  'UrlRegexCondition',
  'KeywordCondition',
])

// Only full-URL condition types get the red limitation warning icon.
const urlTypes = new Set(['UrlWildcardCondition', 'UrlRegexCondition'])

const isUrlType = computed(() => urlTypes.has(props.condition.conditionType))

function groupLabel(key: string): string {
  return t('condition_group_' + key) || groupFallback[key] || key
}

function typeLabel(ty: string): string {
  return t('condition_' + ty) || typeFallback[ty] || ty
}

function str(key: string): string {
  return (props.condition[key] as string) ?? ''
}

function setStr(key: string, e: Event): void {
  props.condition[key] = (e.target as HTMLInputElement).value
  emit('change')
}

function num(key: string): number | '' {
  const v = props.condition[key]
  return typeof v === 'number' ? v : ''
}

function setNum(key: string, e: Event): void {
  const v = (e.target as HTMLInputElement).value
  props.condition[key] = v === '' ? 0 : Number(v)
  emit('change')
}

// == IP literals: single "address/prefix" text field (mirrors omega-ip2str). ==
const ipStr = computed<string>({
  get(): string {
    const ip = (props.condition.ip as string) ?? ''
    if (!ip) return ''
    const prefix = props.condition.prefixLength
    return typeof prefix === 'number' ? ip + '/' + prefix : ip
  },
  set(value: string): void {
    const slash = value.indexOf('/')
    if (slash >= 0) {
      props.condition.ip = value.slice(0, slash)
      props.condition.prefixLength = Number(value.slice(slash + 1)) || 0
    } else {
      props.condition.ip = value
      delete props.condition.prefixLength
    }
    emit('change')
  },
})

const ipValid = computed<boolean>(
  () => ipStr.value === '' || Conditions.parseIp(ipStr.value) != null,
)

// == Day of the week: seven named weekday checkboxes (mirrors updateDay). ==
const weekdayFallback = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function weekdayLabel(i: number): string {
  return t('options_weekDayShort_' + i) || weekdayFallback[i]
}

function weekdays(): boolean[] {
  return Conditions.getWeekdayList(props.condition)
}

function updateDay(i: number, e: Event): void {
  const selected = (e.target as HTMLInputElement).checked
  const days = props.condition.days || '-------'
  const char = selected ? 'SMTWtFs'[i] : '-'
  props.condition.days = days.slice(0, i) + char + days.slice(i + 1)
  delete props.condition.startDay
  delete props.condition.endDay
  emit('change')
}
</script>

<template>
  <div class="form-inline cond-row">
    <select
      v-model="condition.conditionType"
      class="form-control cond-type"
      @change="emit('change')"
    >
      <optgroup
        v-for="group in conditionGroups"
        :key="group.key"
        :label="groupLabel(group.key)"
      >
        <option
          v-for="ty in group.types"
          :key="ty"
          :value="ty"
        >
          {{ typeLabel(ty) }}
        </option>
      </optgroup>
      <!-- Keep an unknown current type (e.g. TrueCondition) selectable so the
           control isn't left blank, without offering it as a normal choice. -->
      <option
        v-if="!knownTypes.has(condition.conditionType)"
        :value="condition.conditionType"
      >
        {{ typeLabel(condition.conditionType) }}
      </option>
    </select>

    <!-- Full-URL limitation warning icon for URL condition types. -->
    <span
      v-if="isUrlType"
      class="glyphicon glyphicon-alert text-danger cond-url-alert"
      :title="
        t('condition_alert_fullUrlLimitation') ||
          'Matching the full URL requires extra permissions and may not work for all requests.'
      "
    />

    <!-- Pattern-based conditions: single text pattern input -->
    <input
      v-if="patternTypes.has(condition.conditionType)"
      type="text"
      class="form-control cond-grow"
      :value="str('pattern')"
      @input="setStr('pattern', $event)"
    >

    <!-- Host levels: min ≤ host levels ≤ max -->
    <template v-else-if="condition.conditionType === 'HostLevelsCondition'">
      <input
        type="number"
        min="1"
        max="99"
        class="form-control cond-num"
        :value="num('minValue')"
        @input="setNum('minValue', $event)"
      >
      <span class="cond-sep">{{ t('options_hostLevelsBetween') || '≤ host levels ≤' }}</span>
      <input
        type="number"
        min="1"
        max="99"
        class="form-control cond-num"
        :value="num('maxValue')"
        @input="setNum('maxValue', $event)"
      >
    </template>

    <!-- IP literals: single "address/prefix" field (e.g. 127.0.0.1/8) -->
    <template v-else-if="condition.conditionType === 'IpCondition'">
      <input
        v-model.lazy="ipStr"
        type="text"
        class="form-control cond-grow"
        :class="{ 'cond-invalid': !ipValid }"
        placeholder="127.0.0.1/8"
      >
    </template>

    <!-- Day of the week: seven named weekday checkboxes -->
    <template v-else-if="condition.conditionType === 'WeekdayCondition'">
      <label
        v-for="(selected, i) in weekdays()"
        :key="i"
        class="checkbox-inline"
      >
        <input
          type="checkbox"
          :checked="selected"
          @change="updateDay(i, $event)"
        >
        {{ weekdayLabel(i) }}
      </label>
    </template>

    <!-- Current time: start ≤ current hour ≤ end -->
    <template v-else-if="condition.conditionType === 'TimeCondition'">
      <input
        type="number"
        min="0"
        max="23"
        class="form-control cond-num"
        :value="num('startHour')"
        @input="setNum('startHour', $event)"
      >
      <span class="cond-sep">{{ t('options_hourBetween') || '≤ current hour ≤' }}</span>
      <input
        type="number"
        min="0"
        max="23"
        class="form-control cond-num"
        :value="num('endHour')"
        @input="setNum('endHour', $event)"
      >
    </template>

    <!-- FalseCondition: ignored when matching; show any leftover pattern disabled -->
    <template v-else-if="condition.conditionType === 'FalseCondition'">
      <input
        v-if="str('pattern')"
        type="text"
        class="form-control cond-grow"
        disabled
        :value="str('pattern')"
        :title="t('condition_details_FalseCondition') || '(Condition ignored when matching)'"
      >
      <span
        v-else
        class="text-muted cond-details"
      >{{ t('condition_details_FalseCondition') || '(Condition ignored when matching)' }}</span>
    </template>

    <!-- TrueCondition / unknown: always matches, no detail field -->
  </div>
</template>

<style scoped>
.cond-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.cond-type {
  width: auto;
}
.cond-grow {
  flex: 1;
  min-width: 8rem;
}
.cond-num {
  width: 5rem;
}
.cond-sep {
  white-space: nowrap;
}
.cond-url-alert {
  cursor: help;
}
.cond-invalid {
  border-color: #a94442;
}
</style>
