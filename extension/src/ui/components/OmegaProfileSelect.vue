<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { dispName } from '@/ui/i18n'
import { useOptionsStore } from '@/ui/store'
import { Profiles, type Profile, type Options } from '@switchyomega/omega-pac'
import { iconForProfile, colorForProfile, BUILTIN_PROFILES, type ProfileLike } from '@/ui/profile_icons'

const props = defineProps<{
  modelValue: string
  disabled?: boolean
  // Owning profile: when set, candidates are restricted to valid result
  // profiles for it (excludes itself and any profile that references it, so
  // circular targets are impossible) — mirrors the original `profiles:profile`.
  profile?: Profile
  // Shown (with a clock icon) as the "no selection" entry; when set, the empty
  // value is selectable — used e.g. for the startup profile ("current profile").
  defaultText?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const store = useOptionsStore()

// When an owning profile is given, list only valid (non-circular, includable)
// result profiles; otherwise list built-in Direct/System + all user profiles.
// Built-ins are floated to the top either way. Hidden __ profiles are excluded.
const options = computed<ProfileLike[]>(() => {
  const toOpt = (p: Profile): ProfileLike => ({
    name: p.name,
    profileType: p.profileType as string,
    color: p.color as string,
  })
  let list: ProfileLike[]
  if (props.profile) {
    const valid = Profiles.validResultProfilesFor(props.profile, store.options as unknown as Options)
    list = valid.filter((p) => !p.name.startsWith('__')).map(toOpt)
  } else {
    list = [...BUILTIN_PROFILES, ...store.profiles.map(toOpt)]
  }
  const rank = (n?: string): number => (n === 'direct' ? 0 : n === 'system' ? 1 : 2)
  return [...list].sort((a, b) => rank(a.name) - rank(b.name))
})

const selected = computed<ProfileLike | undefined>(() =>
  options.value.find((p) => p.name === props.modelValue),
)
const selectedIcon = computed<string>(() =>
  props.modelValue ? iconForProfile(selected.value) : 'glyphicon-time',
)
const selectedColor = computed<string>(() =>
  props.modelValue ? colorForProfile(selected.value) : '#888',
)

const open = ref(false)
const root = ref<HTMLElement | null>(null)

function toggle(): void {
  if (props.disabled) return
  open.value = !open.value
}
function select(name: string): void {
  emit('update:modelValue', name)
  open.value = false
}
function onDocClick(e: MouseEvent): void {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('click', onDocClick, true))
onUnmounted(() => document.removeEventListener('click', onDocClick, true))
</script>

<template>
  <div
    ref="root"
    class="btn-group omega-profile-select"
    :class="{ open, disabled }"
  >
    <button
      type="button"
      class="btn btn-default dropdown-toggle"
      :disabled="disabled"
      aria-haspopup="true"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      <span
        class="glyphicon"
        :class="selectedIcon"
        :style="{ color: selectedColor }"
      />
      {{ ' ' }}
      <span v-if="modelValue">{{ dispName(modelValue) }}</span>
      <span v-else>{{ defaultText }}</span>
      {{ ' ' }}
      <span class="caret" />
    </button>
    <ul
      class="dropdown-menu"
      role="listbox"
    >
      <li
        v-if="defaultText"
        role="option"
        :class="{ active: !modelValue }"
      >
        <a
          role="button"
          @click.stop="select('')"
        >
          <span class="glyphicon glyphicon-time" />
          {{ ' ' }}{{ defaultText }}
        </a>
      </li>
      <li
        v-for="p in options"
        :key="p.name"
        role="option"
        :class="{ active: p.name === modelValue }"
      >
        <a
          role="button"
          @click.stop="select(p.name!)"
        >
          <span
            class="glyphicon"
            :class="iconForProfile(p)"
            :style="{ color: colorForProfile(p) }"
          />
          {{ ' ' }}{{ dispName(p.name!) }}
        </a>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.omega-profile-select .dropdown-menu {
  max-height: 60vh;
  overflow-y: auto;
}
.omega-profile-select.disabled {
  opacity: 0.65;
  pointer-events: none;
}
.omega-profile-select .glyphicon {
  top: 1px;
}
</style>
