<script setup lang="ts">
import { t } from '@/ui/i18n'

const props = defineProps<{
  condition: { conditionType: string; [k: string]: unknown }
}>()

// Condition types, in the same order the original AngularJS options page
// offered them. Labels come from the original `condition_<Type>` i18n keys.
const types: string[] = [
  'HostWildcardCondition',
  'HostRegexCondition',
  'UrlWildcardCondition',
  'UrlRegexCondition',
  'KeywordCondition',
  'HostLevelsCondition',
  'IpCondition',
  'WeekdayCondition',
  'TimeCondition',
  'FalseCondition',
  'TrueCondition',
]

const patternTypes = new Set([
  'HostWildcardCondition',
  'HostRegexCondition',
  'UrlWildcardCondition',
  'UrlRegexCondition',
  'KeywordCondition',
])

function typeLabel(ty: string): string {
  return t('condition_' + ty) || ty
}

function str(key: string): string {
  return (props.condition[key] as string) ?? ''
}

function setStr(key: string, e: Event): void {
  props.condition[key] = (e.target as HTMLInputElement).value
}

function num(key: string): number | '' {
  const v = props.condition[key]
  return typeof v === 'number' ? v : ''
}

function setNum(key: string, e: Event): void {
  const v = (e.target as HTMLInputElement).value
  props.condition[key] = v === '' ? 0 : Number(v)
}
</script>

<template>
  <div class="form-inline cond-row">
    <select
      v-model="condition.conditionType"
      class="form-control cond-type"
    >
      <option
        v-for="ty in types"
        :key="ty"
        :value="ty"
      >
        {{ typeLabel(ty) }}
      </option>
    </select>

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

    <!-- IP literals: address + prefix length -->
    <template v-else-if="condition.conditionType === 'IpCondition'">
      <input
        type="text"
        class="form-control cond-grow"
        placeholder="127.0.0.1"
        :value="str('ip')"
        @input="setStr('ip', $event)"
      >
      <span class="cond-sep">/</span>
      <input
        type="number"
        min="0"
        max="128"
        class="form-control cond-num"
        :value="num('prefixLength')"
        @input="setNum('prefixLength', $event)"
      >
    </template>

    <!-- Day of the week: start - end (0 = Sunday .. 6 = Saturday) -->
    <template v-else-if="condition.conditionType === 'WeekdayCondition'">
      <input
        type="number"
        min="0"
        max="6"
        class="form-control cond-num"
        :value="num('startDay')"
        @input="setNum('startDay', $event)"
      >
      <span class="cond-sep">-</span>
      <input
        type="number"
        min="0"
        max="6"
        class="form-control cond-num"
        :value="num('endDay')"
        @input="setNum('endDay', $event)"
      >
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

    <!-- TrueCondition: always matches, no field -->
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
</style>
