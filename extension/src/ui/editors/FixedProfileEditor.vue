<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted } from 'vue'
import { type Profile } from '@switchyomega/omega-pac'
import { useOptionsStore } from '@/ui/store'
import { t } from '@/ui/i18n'

// ---- Types ----

interface ProxyServer {
  scheme?: string
  host?: string
  port?: number
}
interface AuthEntry {
  username: string
  password: string
}
interface BypassCondition {
  conditionType: 'BypassCondition'
  pattern: string
}

type UrlScheme = '' | 'http' | 'https' | 'ftp'
type ProxyKey = 'fallbackProxy' | 'proxyForHttp' | 'proxyForHttps' | 'proxyForFtp'

// ---- Constants (mirror FixedProfileCtrl) ----

const urlSchemes: UrlScheme[] = ['', 'http', 'https', 'ftp']

const proxyProperties: Record<UrlScheme, ProxyKey> = {
  '': 'fallbackProxy',
  http: 'proxyForHttp',
  https: 'proxyForHttps',
  ftp: 'proxyForFtp',
}

const schemeDisp: Record<UrlScheme, string | null> = {
  '': null,
  http: 'http://',
  https: 'https://',
  ftp: 'ftp://',
}

const defaultPort: Record<string, number> = {
  http: 80,
  https: 443,
  socks4: 1080,
  socks5: 1080,
}

// socks5 proxy auth is only supported where browser.proxy.register exists.
const socks5AuthSupported = ((): boolean => {
  const g = globalThis as { browser?: { proxy?: { register?: unknown } } }
  return g.browser?.proxy?.register != null
})()

const authSupported: Record<string, boolean> = {
  http: true,
  https: true,
  socks5: socks5AuthSupported,
}

interface SchemeOption {
  label: string
  value: string | undefined
}

const optionsForScheme: Record<UrlScheme, SchemeOption[]> = (() => {
  const map = {} as Record<UrlScheme, SchemeOption[]>
  for (const scheme of urlSchemes) {
    const defaultLabel = scheme
      ? t('options_protocol_useDefault') || 'Use default'
      : t('options_protocol_direct') || 'Direct'
    map[scheme] = [
      { label: defaultLabel, value: undefined },
      { label: 'HTTP', value: 'http' },
      { label: 'HTTPS', value: 'https' },
      { label: 'SOCKS4', value: 'socks4' },
      { label: 'SOCKS5', value: 'socks5' },
    ]
  }
  return map
})()

// ---- Setup ----

const props = defineProps<{ profile: Profile }>()
const store = useOptionsStore()

let mounted = false
function touch(): void {
  if (mounted) store.touchProfile(props.profile.name)
}

const showAdvanced = ref(false)

// Per-scheme working editors. When a proxy exists on the profile the editor
// references the same reactive object, so host/port edits flow straight through.
const proxyEditors = reactive<Record<UrlScheme, ProxyServer>>({
  '': {},
  http: {},
  https: {},
  ftp: {},
})

function profileProxy(key: ProxyKey): ProxyServer | undefined {
  return props.profile[key] as ProxyServer | undefined
}

// Watch each profile proxy property -> refresh its editor (mirror the per-scheme
// $watch in the controller). Reveal advanced rows when a per-protocol proxy is set.
for (const scheme of urlSchemes) {
  watch(
    () => profileProxy(proxyProperties[scheme]),
    (proxy) => {
      if (scheme && proxy) showAdvanced.value = true
      proxyEditors[scheme] = proxy ?? {}
    },
    { immediate: true },
  )
}

function cloneEditors(): Record<UrlScheme, ProxyServer> {
  const snap = {} as Record<UrlScheme, ProxyServer>
  for (const scheme of urlSchemes) {
    const p = proxyEditors[scheme]
    snap[scheme] = { scheme: p.scheme, host: p.host, port: p.port }
  }
  return snap
}

// Sync working editors back into the profile (mirror onProxyChange).
function onProxyChange(
  editors: Record<UrlScheme, ProxyServer>,
  oldEditors: Record<UrlScheme, ProxyServer>,
): void {
  const profile = props.profile as Record<string, unknown>
  for (const scheme of urlSchemes) {
    const proxy = editors[scheme]
    const prop = proxyProperties[scheme]
    const auth = profile.auth as Record<string, unknown> | undefined
    if (auth && !authSupported[proxy.scheme ?? '']) {
      delete auth[prop]
    }
    if (!proxy.scheme) {
      if (!scheme && Object.keys(proxy).length) editors[scheme] = {}
      delete profile[prop]
      continue
    } else if (!oldEditors[scheme].scheme) {
      // Just switched from "default" to a real scheme: fill sensible defaults.
      if (proxy.scheme === editors[''].scheme) {
        proxy.port ??= editors[''].port
      }
      proxy.port ??= defaultPort[proxy.scheme]
      proxy.host ??= editors[''].host ?? 'example.com'
    }
    if (profile[prop] == null) profile[prop] = proxy
  }
}

let prevEditors = cloneEditors()
watch(
  proxyEditors,
  () => {
    onProxyChange(proxyEditors, prevEditors)
    prevEditors = cloneEditors()
    touch()
  },
  { deep: true },
)

onMounted(() => {
  mounted = true
})

// ---- Authentication ----

function isProxyAuthActive(scheme: UrlScheme): boolean {
  const auth = props.profile.auth as Record<string, unknown> | undefined
  return auth?.[proxyProperties[scheme]] != null
}

interface AuthModalState {
  prop: ProxyKey
  protocolDisp: string
  authSupported: boolean
  username: string
  password: string
  showPassword: boolean
}

const authModal = ref<AuthModalState | null>(null)

function editProxyAuth(scheme: UrlScheme): void {
  const prop = proxyProperties[scheme]
  const proxy = proxyEditors[scheme]
  const existing = (props.profile.auth as Record<string, AuthEntry> | undefined)?.[prop]
  authModal.value = {
    prop,
    protocolDisp: proxy.scheme ?? '',
    authSupported: !!authSupported[proxy.scheme ?? ''],
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
    if (auth) auth[m.prop] = undefined
  } else {
    if (profile.auth == null) profile.auth = {}
    ;(profile.auth as Record<string, AuthEntry>)[m.prop] = {
      username: m.username,
      password: m.password,
    }
  }
  touch()
  authModal.value = null
}

// ---- Bypass list ----

const bypassList = computed<string>({
  get: () => {
    const list = (props.profile.bypassList as BypassCondition[] | undefined) ?? []
    return list.map((c) => c.pattern).join('\n')
  },
  set: (v) => {
    const list: BypassCondition[] = v
      .split(/\r?\n/)
      .filter((entry) => entry)
      .map((pattern) => ({ conditionType: 'BypassCondition', pattern }))
    ;(props.profile as Record<string, unknown>).bypassList = list
    touch()
  },
})
</script>

<template>
  <div>
    <section class="settings-group settings-group-fixed-servers">
      <h3>{{ t('options_group_proxyServers') || 'Proxy servers' }}</h3>
      <div class="table-responsive">
        <table class="fixed-servers table table-bordered table-striped width-limit-lg">
          <thead>
            <tr>
              <th>{{ t('options_proxy_scheme') || 'Scheme' }}</th>
              <th>{{ t('options_proxy_protocol') || 'Protocol' }}</th>
              <th>{{ t('options_proxy_server') || 'Server' }}</th>
              <th>{{ t('options_proxy_port') || 'Port' }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="scheme in urlSchemes"
              v-show="scheme === '' || showAdvanced"
              :key="scheme"
            >
              <td>{{ schemeDisp[scheme] || (t('options_scheme_default') || 'Default') }}</td>
              <td>
                <select
                  v-model="proxyEditors[scheme].scheme"
                  class="form-control"
                >
                  <option
                    v-for="opt in optionsForScheme[scheme]"
                    :key="String(opt.value)"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </td>

              <td v-if="proxyEditors[scheme].scheme">
                <input
                  v-model="proxyEditors[scheme].host"
                  class="form-control"
                  type="text"
                  required
                >
              </td>
              <td v-else>
                <input
                  class="form-control"
                  type="text"
                  value=""
                  :placeholder="proxyEditors[''].host"
                  disabled
                >
              </td>

              <td v-if="proxyEditors[scheme].scheme">
                <input
                  v-model.number="proxyEditors[scheme].port"
                  class="form-control"
                  type="number"
                  min="1"
                  required
                >
              </td>
              <td v-else>
                <input
                  class="form-control"
                  type="number"
                  value=""
                  :placeholder="proxyEditors[''].port != null ? String(proxyEditors[''].port) : ''"
                  disabled
                >
              </td>

              <td class="proxy-actions">
                <button
                  class="btn btn-xs proxy-auth-toggle"
                  :class="isProxyAuthActive(scheme) ? 'btn-success' : 'btn-default'"
                  type="button"
                  role="button"
                  :title="t('options_proxy_auth') || 'Proxy authentication'"
                  @click="editProxyAuth(scheme)"
                >
                  <span class="glyphicon glyphicon-lock" />
                </button>
              </td>
            </tr>
          </tbody>
          <tbody v-show="!showAdvanced">
            <tr class="fixed-show-advanced">
              <td colspan="7">
                <button
                  class="btn btn-link"
                  @click="showAdvanced = true"
                >
                  <span class="glyphicon glyphicon-chevron-down" /> {{ t('options_proxy_expand') || 'Show advanced' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="settings-group">
      <h3>{{ t('options_group_bypassList') || 'Bypass List' }}</h3>
      <p class="help-block">
        {{ t('options_bypassListHelp') || 'Servers for which you do not want to use any proxy:' }}
      </p>
      <p class="help-block">
        <a
          href="https://developer.chrome.com/extensions/proxy#bypass_list"
          target="_blank"
        >
          {{ t('options_bypassListHelpLinkText') || 'The bypass list format documentation' }}
        </a>
      </p>
      <textarea
        v-model.lazy="bypassList"
        class="monospace form-control width-limit"
        rows="10"
      />
    </section>

    <!-- Proxy authentication modal (mirror fixed_auth_edit.jade) -->
    <div
      v-if="authModal"
      class="omega-modal-backdrop"
    >
      <div
        class="modal-dialog"
        :class="authModal.authSupported ? 'modal-sm' : 'modal-lg'"
      >
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
              <div
                v-show="!authModal.authSupported"
                class="form-group"
              >
                <div class="alert alert-danger">
                  <span class="glyphicon glyphicon-warning-sign" />
                  {{ t('options_proxy_authNotSupported', [authModal.protocolDisp]) || 'Proxy authentication is not supported for this protocol.' }}
                </div>
              </div>
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
.proxy-actions {
  width: 1%;
  white-space: nowrap;
}
</style>
