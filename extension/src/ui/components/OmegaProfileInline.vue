<script setup lang="ts">
import { dispName } from '@/ui/i18n'

// Structural minimum so both the options-page Profile and the popup's lighter
// available-profile shape satisfy it.
defineProps<{ profile: { name: string; profileType?: string; color?: unknown } }>()
</script>

<template>
  <span class="omega-profile-inline">
    <span
      class="profile-icon"
      :class="{ virtual: profile.profileType === 'VirtualProfile' }"
      :style="{ backgroundColor: (profile.color as string) || '#888' }"
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
.profile-icon {
  display: inline-block;
  width: 13px;
  height: 13px;
  border-radius: 3px;
  margin-right: 7px;
  flex: none;
}
.profile-icon.virtual {
  border: dotted 1px #333;
  margin: -1px 6px -1px -1px;
}
.profile-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
