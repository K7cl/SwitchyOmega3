<script setup lang="ts">
import { computed, ref, nextTick, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { useOptionsStore } from '@/ui/store'
import { t, dispName } from '@/ui/i18n'
import FixedProfileEditor from '@/ui/editors/FixedProfileEditor.vue'
import SwitchProfileEditor from '@/ui/editors/SwitchProfileEditor.vue'
import PacProfileEditor from '@/ui/editors/PacProfileEditor.vue'
import RuleListProfileEditor from '@/ui/editors/RuleListProfileEditor.vue'
import VirtualProfileEditor from '@/ui/editors/VirtualProfileEditor.vue'
import UnsupportedProfileEditor from '@/ui/editors/UnsupportedProfileEditor.vue'

const props = defineProps<{ name: string }>()

const store = useOptionsStore()
const router = useRouter()

const profile = computed(() => store.profile(props.name))

const isBuiltin = computed(() => Boolean(profile.value?.builtin))

/** Resolve the type-specific editor for the current profile. */
const editorComponent = computed<Component>(() => {
  const type = profile.value?.profileType ?? ''
  if (type === 'FixedProfile') return FixedProfileEditor
  if (type === 'SwitchProfile') return SwitchProfileEditor
  if (type === 'PacProfile' || type === 'AutoDetectProfile') return PacProfileEditor
  if (type.includes('RuleList')) return RuleListProfileEditor
  if (type === 'VirtualProfile') return VirtualProfileEditor
  return UnsupportedProfileEditor
})

function onColorChange(e: Event): void {
  const p = profile.value
  if (!p) return
  p.color = (e.target as HTMLInputElement).value
  store.touchProfile(p.name)
}

// --- Rename -----------------------------------------------------------------
const renaming = ref(false)
const renameValue = ref('')
const renameError = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

function startRename(): void {
  if (isBuiltin.value) return
  renameValue.value = props.name
  renameError.value = ''
  renaming.value = true
  void nextTick(() => renameInput.value?.focus())
}

function cancelRename(): void {
  renaming.value = false
  renameError.value = ''
}

async function confirmRename(): Promise<void> {
  const next = renameValue.value.trim()
  if (!next) {
    renameError.value = t('dialog_error_profileName') || 'Please enter a name.'
    return
  }
  if (next === props.name) {
    renaming.value = false
    return
  }
  if (store.profile(next) || next === 'direct' || next === 'system') {
    renameError.value = t('dialog_error_profileNameUsed') || 'That name is already taken.'
    return
  }
  await store.renameProfile(props.name, next)
  renaming.value = false
  router.replace('/profile/' + encodeURIComponent(next))
}

// --- Apply / Delete ---------------------------------------------------------
async function onApply(): Promise<void> {
  await store.applyProfile(props.name)
}

function onDelete(): void {
  if (isBuiltin.value) return
  if (store.setting<boolean>('-confirmDeletion')) {
    const msg =
      t('options_confirmDeletion', dispName(props.name)) ||
      'Are you sure you want to delete this profile?'
    if (!window.confirm(msg)) return
  }
  store.deleteProfile(props.name)
  router.push('/about')
}
</script>

<template>
  <div
    v-if="!profile"
    class="card"
  >
    <p class="err">
      {{ t('options_profileNotFound') || 'Profile not found.' }}
    </p>
  </div>

  <template v-else>
    <div class="card header">
      <div class="row title-row">
        <input
          type="color"
          class="color"
          :value="(profile.color as string) || '#000000'"
          :title="t('options_profileColor') || 'Profile color'"
          @change="onColorChange"
        >
        <h1
          v-if="!renaming"
          class="pname"
        >
          {{ dispName(profile.name) }}
        </h1>
        <div
          v-else
          class="rename row"
        >
          <input
            ref="renameInput"
            v-model="renameValue"
            type="text"
            class="rename-input"
            @keyup.enter="confirmRename"
            @keyup.esc="cancelRename"
          >
          <button
            class="btn primary"
            @click="confirmRename"
          >
            {{ t('dialog_ok') || 'OK' }}
          </button>
          <button
            class="btn ghost"
            @click="cancelRename"
          >
            {{ t('dialog_cancel') || 'Cancel' }}
          </button>
        </div>

        <span class="spacer" />

        <template v-if="!renaming">
          <button
            v-if="!isBuiltin"
            class="btn ghost"
            @click="startRename"
          >
            {{ t('options_renameProfile') || 'Rename' }}
          </button>
          <button
            class="btn"
            @click="onApply"
          >
            {{ t('popup_applyProfile') || 'Apply' }}
          </button>
          <button
            v-if="!isBuiltin"
            class="btn danger"
            @click="onDelete"
          >
            {{ t('options_deleteProfile') || 'Delete' }}
          </button>
        </template>
      </div>
      <p
        v-if="renameError"
        class="err"
      >
        {{ renameError }}
      </p>
    </div>

    <component
      :is="editorComponent"
      :profile="profile"
    />
  </template>
</template>

<style scoped>
.header {
  margin-bottom: 1rem;
}
.title-row {
  align-items: center;
}
.color {
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}
.pname {
  margin: 0;
}
.rename-input {
  min-width: 12rem;
}
</style>
