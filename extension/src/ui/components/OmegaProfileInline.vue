<script setup lang="ts">
import { computed } from 'vue'
import { dispName } from '@/ui/i18n'

// Structural minimum so both the options-page Profile and the popup's lighter
// available-profile shape satisfy it.
const props = defineProps<{ profile: { name: string; profileType?: string; color?: unknown } }>()

// Per-type glyphicon (matches the original omega_decoration profileIcons), so
// different proxy types are visually distinguishable, not just colored squares.
const PROFILE_ICONS: Record<string, string> = {
  DirectProfile: 'glyphicon-transfer',
  SystemProfile: 'glyphicon-off',
  AutoDetectProfile: 'glyphicon-file',
  FixedProfile: 'glyphicon-globe',
  PacProfile: 'glyphicon-file',
  VirtualProfile: 'glyphicon-question-sign',
  RuleListProfile: 'glyphicon-list',
  SwitchProfile: 'glyphicon-retweet',
}

// Built-in profiles are referenced by name without a profileType — infer it.
const NAME_TYPE: Record<string, string> = {
  direct: 'DirectProfile',
  system: 'SystemProfile',
  auto_detect: 'AutoDetectProfile',
}

const iconClass = computed<string>(() => {
  const type = props.profile.profileType || NAME_TYPE[props.profile.name] || 'FixedProfile'
  return PROFILE_ICONS[type] || 'glyphicon-globe'
})

const iconColor = computed<string>(() => (props.profile.color as string) || '#888')
</script>

<template>
  <span class="omega-profile-inline">
    <span
      class="glyphicon profile-type-icon"
      :class="iconClass"
      :style="{ color: iconColor }"
    />
    <span class="profile-name">{{ dispName(profile.name) }}</span>
  </span>
</template>

<style scoped>
.omega-profile-inline {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}
.profile-type-icon {
  margin-right: 7px;
  top: 1px;
  flex: none;
}
.profile-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
