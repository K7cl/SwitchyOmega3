<script setup lang="ts">
import { computed, ref } from 'vue'
import { Profiles, type Profile } from '@switchyomega/omega-pac'
import { useOptionsStore } from '@/ui/store'
import { callBackground } from '@/ui/messaging'
import { t } from '@/ui/i18n'
import { formatDateTime } from '@/ui/format'

const props = defineProps<{ profile: Profile }>()
const store = useOptionsStore()

function touch(): void {
  store.touchProfile(props.profile.name)
}

// input-group-clear behaviour: toggle swaps the current value with a stashed one.
const oldPacUrl = ref<string>('')

const pacUrl = computed<string>({
  get: () => (props.profile.pacUrl as string) || '',
  set: (v) => {
    const prev = (props.profile.pacUrl as string) || ''
    props.profile.pacUrl = v
    if (v) oldPacUrl.value = ''
    // Changing the URL invalidates the cached script: mark it obsolete so it
    // gets re-downloaded — but only when the URL actually changed to a new,
    // non-empty value (mirrors the original's revert/obsolete-marking).
    if (v && v !== prev) props.profile.lastUpdate = undefined
    touch()
  },
})

function toggleClear(): void {
  const current = pacUrl.value
  props.profile.pacUrl = oldPacUrl.value
  oldPacUrl.value = current
  touch()
}

// A file:// PAC URL is loaded directly by the browser; the script is not fetched.
const pacUrlIsFile = computed<boolean>(() => Profiles.isFileUrl(pacUrl.value))

const pacScript = computed<string>({
  get: () => (props.profile.pacScript as string) || '',
  set: (v) => {
    props.profile.pacScript = v
    touch()
  },
})

const lastUpdate = computed<unknown>(() => props.profile.lastUpdate)
const lastUpdateText = computed<string>(() => formatDateTime(props.profile.lastUpdate as string | undefined))

const status = ref<string>('')
const downloading = ref<boolean>(false)
let statusTimer: ReturnType<typeof setTimeout> | undefined

function flash(msg: string): void {
  status.value = msg
  if (statusTimer) clearTimeout(statusTimer)
  statusTimer = setTimeout(() => {
    status.value = ''
  }, 4000)
}

async function updateProfile(): Promise<void> {
  if (downloading.value) return
  downloading.value = true
  status.value = ''
  try {
    await callBackground('updateProfile', props.profile.name)
    flash(t('options_pacScriptLastUpdate', [formatDateTime(new Date())]) || 'PAC script updated.')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    flash((t('options_pacScriptObsolete') || 'Download failed') + ': ' + message)
  } finally {
    downloading.value = false
  }
}

// ---- Proxy authentication (mirror FixedProfileEditor, single scheme keyed 'all') ----

interface AuthEntry {
  username: string
  password: string
}

// Credentials for a PAC-provided proxy are stored under profile.auth.all.
const authActive = computed<boolean>(() => {
  const auth = props.profile.auth as Record<string, unknown> | undefined
  return auth?.all != null
})

interface AuthModalState {
  username: string
  password: string
  showPassword: boolean
}

const authModal = ref<AuthModalState | null>(null)

function editProxyAuth(): void {
  const existing = (props.profile.auth as Record<string, AuthEntry> | undefined)?.all
  authModal.value = {
    username: existing?.username ?? '',
    password: existing?.password ?? '',
    showPassword: false,
  }
}

function closeAuth(): void {
  authModal.value = null
}

function saveAuth(): void {
  const m = authModal.value
  if (!m) return
  const profile = props.profile as Record<string, unknown>
  if (!m.username) {
    const auth = profile.auth as Record<string, unknown> | undefined
    if (auth) {
      delete auth.all
      if (Object.keys(auth).length === 0) profile.auth = undefined
    }
  } else {
    if (profile.auth == null) profile.auth = {}
    ;(profile.auth as Record<string, AuthEntry>).all = {
      username: m.username,
      password: m.password,
    }
  }
  touch()
  authModal.value = null
}
</script>

<template>
  <div>
    <section class="settings-group">
      <h3>{{ t('options_group_pacUrl') || 'PAC URL' }}</h3>
      <div class="width-limit">
        <div class="input-group">
          <input
            v-model="pacUrl"
            type="text"
            class="form-control"
            placeholder="https://example.com/proxy.pac"
          >
          <span class="input-group-btn">
            <button
              type="button"
              class="btn btn-default input-group-clear-btn"
              :disabled="!pacUrl && !oldPacUrl"
              :title="oldPacUrl ? (t('inputClear_restore') || 'Restore') : (t('inputClear_clear') || 'Clear')"
              @click="toggleClear"
            >
              <span
                class="glyphicon"
                :class="oldPacUrl ? 'glyphicon-repeat' : 'glyphicon-remove'"
              />
            </button>
          </span>
        </div>
      </div>
      <p class="help-block">
        {{ t('options_pacUrlHelp') || 'The URL of the PAC file.' }}
      </p>
      <p v-if="pacUrl && !pacUrlIsFile">
        <button
          class="btn"
          :class="pacUrl && !lastUpdate ? 'btn-primary' : 'btn-default'"
          type="button"
          :disabled="downloading"
          @click="updateProfile"
        >
          <span class="glyphicon glyphicon-download-alt" />
          {{ ' ' }}{{ t('options_downloadProfileNow') || 'Download Profile Now' }}
        </button>
      </p>
    </section>

    <section class="settings-group">
      <h3>
        {{ t('options_group_pacScript') || 'PAC Script' }}{{ ' ' }}
        <button
          class="btn btn-xs proxy-auth-toggle"
          :class="authActive ? 'btn-success' : 'btn-default'"
          type="button"
          role="button"
          :title="t('options_proxy_auth') || 'Proxy authentication'"
          @click="editProxyAuth"
        >
          <span class="glyphicon glyphicon-lock" />
        </button>
      </h3>
      <div
        v-if="authActive"
        class="alert alert-warning width-limit"
      >
        {{ t('options_proxy_authAllWarningPac') || t('options_proxy_authAllWarning') || 'Credentials are sent to the PAC-provided proxy for all requests.' }}
      </div>
      <template v-if="!pacUrlIsFile">
        <p
          v-if="pacUrl && lastUpdate"
          class="alert alert-success width-limit"
        >
          {{ t('options_pacScriptLastUpdate', [lastUpdateText]) || ('PAC script downloaded at ' + lastUpdateText) }}
        </p>
        <p
          v-if="pacUrl && !lastUpdate"
          class="alert alert-danger width-limit"
        >
          {{ t('options_pacScriptObsolete') || 'The PAC script is obsolete. Please download it again.' }}
        </p>
        <p
          v-if="status"
          class="help-block"
        >
          {{ status }}
        </p>
        <textarea
          v-model="pacScript"
          class="monospace form-control width-limit"
          rows="20"
          spellcheck="false"
          :disabled="!!pacUrl"
        />
      </template>
      <p
        v-else
        class="help-block"
      >
        <span class="glyphicon glyphicon-info-sign" />
        {{ ' ' }}{{ t('options_pacUrlFileHelp') || 'The PAC file will be loaded directly from this local URL.' }}
      </p>
    </section>

    <!-- Proxy authentication modal (mirror fixed_auth_edit.jade, single 'all' scheme) -->
    <Teleport to="body">
      <div
        v-if="authModal"
        class="omega-modal-backdrop"
      >
        <div class="modal-dialog modal-sm">
          <div class="modal-content">
            <form
              name="authForm"
              @submit.prevent="saveAuth"
            >
              <div class="modal-header">
                <button
                  class="close"
                  type="button"
                  @click="closeAuth"
                >
                  <span aria-hidden="true">×</span>
                  <span class="sr-only">Close</span>
                </button>
                <h4 class="modal-title">
                  {{ t('options_modalHeader_proxyAuth') || 'Proxy Authentication' }}
                </h4>
              </div>
              <div
                class="modal-body"
                style="padding-bottom: 0;"
              >
                <div class="form-group">
                  <label class="sr-only">{{ t('options_proxyAuthUsername') || 'Username' }}</label>
                  <input
                    v-model="authModal.username"
                    class="form-control"
                    type="text"
                    autofocus
                    :placeholder="t('options_proxyAuthUsername') || 'Username'"
                  >
                </div>
                <div class="form-group">
                  <label class="sr-only">{{ t('options_proxyAuthPassword') || 'Password' }}</label>
                  <div class="input-group">
                    <input
                      v-show="!!authModal.username"
                      v-model="authModal.password"
                      class="form-control"
                      :type="authModal.showPassword ? 'text' : 'password'"
                      :placeholder="t('options_proxyAuthPassword') || 'Password'"
                    >
                    <input
                      v-show="!authModal.username"
                      class="form-control"
                      type="text"
                      value=""
                      :placeholder="t('options_proxyAuthNone') || 'None'"
                      disabled
                    >
                    <span class="input-group-btn">
                      <button
                        class="btn btn-default"
                        type="button"
                        :title="(authModal.showPassword ? t('options_proxyAuthHidePassword') : t('options_proxyAuthShowPassword')) || ''"
                        :disabled="!authModal.username"
                        @click="authModal.showPassword = !authModal.showPassword"
                      >
                        <span
                          class="glyphicon"
                          :class="authModal.showPassword ? 'glyphicon-eye-open' : 'glyphicon-eye-close'"
                        />
                      </button>
                    </span>
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <button
                  class="btn btn-default"
                  type="button"
                  @click="closeAuth"
                >
                  {{ t('dialog_cancel') || 'Cancel' }}
                </button>
                <button
                  class="btn btn-primary"
                  type="submit"
                >
                  {{ t('dialog_save') || 'Save' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.omega-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1050;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 40px;
  overflow: auto;
  background: rgba(0, 0, 0, 0.5);
}
</style>
