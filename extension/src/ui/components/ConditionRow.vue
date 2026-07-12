<script setup lang="ts">
import { t } from '@/ui/i18n'

const props = defineProps<{
  condition: { conditionType: string; [k: string]: unknown }
}>()

const types: Array<{ value: string; label: string }> = [
  { value: 'HostWildcardCondition', label: t('cond_hostWildcard') || 'Host wildcard' },
  { value: 'HostRegexCondition', label: t('cond_hostRegex') || 'Host regex' },
  { value: 'UrlWildcardCondition', label: t('cond_urlWildcard') || 'URL wildcard' },
  { value: 'UrlRegexCondition', label: t('cond_urlRegex') || 'URL regex' },
  { value: 'KeywordCondition', label: t('cond_keyword') || 'Keyword' },
  { value: 'HostLevelsCondition', label: t('cond_hostLevels') || 'Host levels' },
  { value: 'IpCondition', label: t('cond_ip') || 'IP subnet' },
  { value: 'WeekdayCondition', label: t('cond_weekday') || 'Weekday' },
  { value: 'TimeCondition', label: t('cond_time') || 'Time (hour)' },
  { value: 'FalseCondition', label: t('cond_false') || 'Disabled (never)' },
  { value: 'TrueCondition', label: t('cond_true') || 'Always' },
]

const patternTypes = new Set([
  'HostWildcardCondition',
  'HostRegexCondition',
  'UrlWildcardCondition',
  'UrlRegexCondition',
  'KeywordCondition',
])

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
  <div class="row cond-row">
    <select v-model="condition.conditionType">
      <option
        v-for="ty in types"
        :key="ty.value"
        :value="ty.value"
      >
        {{ ty.label }}
      </option>
    </select>

    <input
      v-if="patternTypes.has(condition.conditionType)"
      type="text"
      class="grow"
      :value="str('pattern')"
      :placeholder="t('cond_patternPlaceholder') || 'Pattern'"
      @input="setStr('pattern', $event)"
    >

    <template v-else-if="condition.conditionType === 'HostLevelsCondition'">
      <input
        type="number"
        :value="num('minValue')"
        :placeholder="t('cond_min') || 'Min'"
        @input="setNum('minValue', $event)"
      >
      <input
        type="number"
        :value="num('maxValue')"
        :placeholder="t('cond_max') || 'Max'"
        @input="setNum('maxValue', $event)"
      >
    </template>

    <template v-else-if="condition.conditionType === 'IpCondition'">
      <input
        type="text"
        class="grow"
        :value="str('ip')"
        :placeholder="t('cond_ip') || 'IP address'"
        @input="setStr('ip', $event)"
      >
      <input
        type="number"
        :value="num('prefixLength')"
        :placeholder="t('cond_prefix') || 'Prefix'"
        @input="setNum('prefixLength', $event)"
      >
    </template>

    <template v-else-if="condition.conditionType === 'WeekdayCondition'">
      <input
        type="number"
        min="0"
        max="6"
        :value="num('startDay')"
        :placeholder="t('cond_startDay') || 'Start day (0-6)'"
        @input="setNum('startDay', $event)"
      >
      <input
        type="number"
        min="0"
        max="6"
        :value="num('endDay')"
        :placeholder="t('cond_endDay') || 'End day (0-6)'"
        @input="setNum('endDay', $event)"
      >
    </template>

    <template v-else-if="condition.conditionType === 'TimeCondition'">
      <input
        type="number"
        min="0"
        max="23"
        :value="num('startHour')"
        :placeholder="t('cond_startHour') || 'Start hour (0-23)'"
        @input="setNum('startHour', $event)"
      >
      <input
        type="number"
        min="0"
        max="23"
        :value="num('endHour')"
        :placeholder="t('cond_endHour') || 'End hour (0-23)'"
        @input="setNum('endHour', $event)"
      >
    </template>
  </div>
</template>

<style scoped>
.cond-row {
  align-items: center;
}
.grow {
  flex: 1;
  min-width: 8rem;
}
.cond-row input[type='number'] {
  width: 6rem;
}
</style>
