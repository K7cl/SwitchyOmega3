<script setup lang="ts">
import { computed } from 'vue'
import { dispName } from '@/ui/i18n'
import { iconForProfile, colorForProfile } from '@/ui/profile_icons'

// Structural minimum so both the options-page Profile and the popup's lighter
// available-profile shape satisfy it.
const props = defineProps<{ profile: { name: string; profileType?: string; color?: unknown } }>()

// Per-type glyphicon tinted by color, so proxy types are distinguishable.
const iconClass = computed<string>(() => iconForProfile(props.profile))
const iconColor = computed<string>(() => colorForProfile(props.profile))
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
