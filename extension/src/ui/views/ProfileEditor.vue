<script setup lang="ts">
import { computed, ref, nextTick, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { useOptionsStore } from '@/ui/store'
import { t, dispName } from '@/ui/i18n'
import { type Profile, type Options, PacGenerator, Switchy } from '@switchyomega/omega-pac'
import FixedProfileEditor from '@/ui/editors/FixedProfileEditor.vue'
import SwitchProfileEditor from '@/ui/editors/SwitchProfileEditor.vue'
import PacProfileEditor from '@/ui/editors/PacProfileEditor.vue'
import RuleListProfileEditor from '@/ui/editors/RuleListProfileEditor.vue'
import VirtualProfileEditor from '@/ui/editors/VirtualProfileEditor.vue'
import UnsupportedProfileEditor from '@/ui/editors/UnsupportedProfileEditor.vue'

const props = defineProps<{ name: string }>()

const store = useOptionsStore()
const router = useRouter()

const profile = computed(() => {
  const p = store.profile(props.name)
  // Hidden attached profiles (name starts with __) are not editable here.
  return p && !p.name.startsWith('__') ? p : undefined
})

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

const isVirtual = computed(() => profile.value?.profileType === 'VirtualProfile')

/** Resolve the effective color for a virtual profile through its target chain. */
const virtualColor = computed<string>(() => {
  let p: Profile | undefined = profile.value
  let color: string | undefined
  const seen = new Set<string>()
  while (p && !seen.has(p.name)) {
    seen.add(p.name)
    color = p.color as string | undefined
    const target = p.defaultProfileName as string | undefined
    p = target ? store.profile(target) : undefined
  }
  return color || '#99dd99'
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

// --- Export / Delete --------------------------------------------------------
// A PAC can be generated for any profile except the built-in Direct/System.
const scriptable = computed<boolean>(() => {
  const type = profile.value?.profileType
  return !!type && type !== 'DirectProfile' && type !== 'SystemProfile'
})
// Rule lists can be exported for Switch and RuleList profiles.
const canExportRuleList = computed<boolean>(() => {
  const type = profile.value?.profileType ?? ''
  return type === 'SwitchProfile' || type.includes('RuleList')
})

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function exportPac(): void {
  const p = profile.value
  if (!p) return
  let missing: string | null = null
  const ast = PacGenerator.script(store.options as unknown as Options, p.name, {
    profileNotFound: (name: string) => {
      missing = name
      return 'dumb'
    },
  })
  const pac = PacGenerator.ascii(ast.print_to_string())
  downloadText(`OmegaProfile_${p.name.replace(/\W+/g, '_')}.pac`, pac)
  if (missing) window.alert(t('options_profileNotFound', [missing]) || `Missing profile: ${missing}`)
}

function exportRuleList(): void {
  const p = profile.value
  if (!p) return
  const fileName = `OmegaRules_${p.name.replace(/\W+/g, '_')}.sorl`
  if (p.profileType === 'SwitchProfile') {
    // Effective default: attached rule list's own default when attached.
    const attachedName = '__ruleListOf_' + p.name
    const attached = store.profile(attachedName)
    const def =
      attached && p.defaultProfileName === attachedName
        ? (attached.defaultProfileName as string)
        : (p.defaultProfileName as string)
    let text = Switchy.compose(
      { rules: (p.rules as never) || [], defaultProfileName: def || 'direct' },
      { withResult: true },
    )
    text = text.replace('\n', '\n; Date: ' + new Date().toLocaleDateString() + '\n')
    downloadText(fileName, text)
  } else {
    downloadText(fileName, (p.ruleList as string) || '')
  }
}

function onDelete(): void {
  if (isBuiltin.value) return
  // Referential integrity: block deletion while other profiles still target this
  // one as a result profile, listing them so the user can fix those references.
  const refs = store.profilesReferencing(props.name)
  if (refs.length) {
    window.alert(
      (t('options_cannotDeleteProfile') ||
        'This profile cannot be deleted because it is referenced by other profiles:') +
        '\n' +
        refs.join(', '),
    )
    return
  }
  if (store.setting<boolean>('-confirmDeletion')) {
    const msg =
      t('options_confirmDeletion', dispName(props.name)) ||
      'Are you sure you want to delete this profile?'
    if (!window.confirm(msg)) return
  }
  store.deleteProfile(props.name)
  router.push('/about')
}

const syncOptions = computed(() => profile.value?.syncOptions as string | undefined)
const syncError = computed(
  () => profile.value?.syncError as { reason?: string } | undefined,
)
</script>

<template>
  <div
    v-if="!profile"
    class="alert alert-danger width-limit"
  >
    <span class="glyphicon glyphicon-remove" />
    {{ ' ' }}
    {{ t('options_profileNotFound') || 'Profile not found.' }}
  </div>

  <template v-else>
    <div class="page-header">
      <div class="profile-actions">
        <template v-if="!renaming">
          <button
            v-if="canExportRuleList"
            class="btn btn-default"
            :title="t('options_profileExportRuleListHelp') || 'Export the rule list to a file'"
            @click="exportRuleList"
          >
            <span class="glyphicon glyphicon-list" />
            {{ ' ' }}
            {{ t('options_profileExportRuleList') || 'Export rule list' }}
          </button>
          {{ ' ' }}
          <button
            v-if="scriptable"
            class="btn btn-default"
            :title="t('options_exportPacFileHelp') || 'Export the generated PAC script'"
            @click="exportPac"
          >
            <span class="glyphicon glyphicon-download" />
            {{ ' ' }}
            {{ t('options_profileExportPac') || 'Export PAC' }}
          </button>
          {{ ' ' }}
          <button
            v-if="!isBuiltin"
            class="btn btn-default"
            @click="startRename"
          >
            <span class="glyphicon glyphicon-edit" />
            {{ ' ' }}
            {{ t('options_renameProfile') || 'Rename' }}
          </button>
          {{ ' ' }}
          <button
            v-if="!isBuiltin"
            class="btn btn-danger"
            @click="onDelete"
          >
            <span class="glyphicon glyphicon-trash" />
            {{ ' ' }}
            {{ t('options_deleteProfile') || 'Delete' }}
          </button>
        </template>
        <template v-else>
          <div class="input-group">
            <input
              ref="renameInput"
              v-model="renameValue"
              type="text"
              class="form-control"
              @keyup.enter="confirmRename"
              @keyup.esc="cancelRename"
            >
            <span class="input-group-btn">
              <button
                class="btn btn-primary"
                @click="confirmRename"
              >
                {{ t('dialog_ok') || 'OK' }}
              </button>
              <button
                class="btn btn-default"
                @click="cancelRename"
              >
                {{ t('dialog_cancel') || 'Cancel' }}
              </button>
            </span>
          </div>
        </template>
      </div>

      <span class="profile-color-editor">
        <div
          v-if="isVirtual"
          class="profile-color-editor-fake"
          :style="{ 'background-color': virtualColor }"
        />
        <input
          v-else
          type="color"
          :value="(profile.color as string) || '#000000'"
          :title="t('options_profileColor') || 'Profile color'"
          @change="onColorChange"
        >
      </span>

      <h2 class="profile-name">
        {{ t('options_profileTabPrefix') }}{{ dispName(profile.name) }}
      </h2>
    </div>

    <p
      v-if="renameError"
      class="alert alert-danger width-limit"
    >
      {{ renameError }}
    </p>

    <section
      v-if="syncOptions === 'disabled'"
      class="settings-group"
    >
      <p
        v-if="!syncError"
        class="alert alert-info width-limit"
      >
        <span class="glyphicon glyphicon-info-sign" />
        {{ ' ' }}
        {{ t('options_profileSyncDisabled') || 'Syncing is disabled for this profile.' }}
      </p>
      <p
        v-else
        class="alert alert-danger width-limit"
      >
        <span class="glyphicon glyphicon-remove" />
        {{ ' ' }}
        {{ t('options_profileSyncDisabled_' + (syncError.reason || '')) }}
      </p>
    </section>

    <component
      :is="editorComponent"
      :profile="profile"
    />
  </template>
</template>
