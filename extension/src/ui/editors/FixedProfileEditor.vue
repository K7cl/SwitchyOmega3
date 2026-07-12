<script setup lang="ts">
import { computed, ref } from 'vue'
import { type Profile } from '@switchyomega/omega-pac'
import { useOptionsStore } from '@/ui/store'
import { t } from '@/ui/i18n'

interface ProxyServer {
  scheme: string
  host: string
  port: number
}
interface AuthEntry {
  username: string
  password: string
}
interface BypassCondition {
  conditionType: 'BypassCondition'
  pattern: string
}

type ProxyKey = 'fallbackProxy' | 'proxyForHttp' | 'proxyForHttps' | 'proxyForFtp'

const SCHEMES = ['http', 'https', 'socks4', 'socks5']

const props = defineProps<{ profile: Profile }>()
const store = useOptionsStore()

function touch(): void {
  store.touchProfile(props.profile.name)
}

/** Lazily create the proxy object at `key` if it is missing, returning it. */
function ensureProxy(key: ProxyKey): ProxyServer {
  const p = props.profile as Record<string, unknown>
  if (p[key] == null) p[key] = { scheme: 'http', host: '', port: 80 }
  return p[key] as ProxyServer
}

function proxyOf(key: ProxyKey): ProxyServer | undefined {
  return props.profile[key] as ProxyServer | undefined
}

/** Build a set of get/set computeds bound to the proxy object at `key`. */
function makeProxy(key: ProxyKey) {
  return {
    enabled: computed<boolean>({
      get: () => proxyOf(key) != null,
      set: (v) => {
        if (v) ensureProxy(key)
        else delete (props.profile as Record<string, unknown>)[key]
        touch()
      },
    }),
    scheme: computed<string>({
      get: () => proxyOf(key)?.scheme ?? 'http',
      set: (v) => {
        ensureProxy(key).scheme = v
        touch()
      },
    }),
    host: computed<string>({
      get: () => proxyOf(key)?.host ?? '',
      set: (v) => {
        ensureProxy(key).host = v
        touch()
      },
    }),
    port: computed<number>({
      get: () => proxyOf(key)?.port ?? 0,
      set: (v) => {
        ensureProxy(key).port = Number(v) || 0
        touch()
      },
    }),
  }
}

const { scheme: fbScheme, host: fbHost, port: fbPort } = makeProxy('fallbackProxy')
const {
  enabled: httpEnabled,
  scheme: httpScheme,
  host: httpHost,
  port: httpPort,
} = makeProxy('proxyForHttp')
const {
  enabled: httpsEnabled,
  scheme: httpsScheme,
  host: httpsHost,
  port: httpsPort,
} = makeProxy('proxyForHttps')
const {
  enabled: ftpEnabled,
  scheme: ftpScheme,
  host: ftpHost,
  port: ftpPort,
} = makeProxy('proxyForFtp')

const showAdvanced = ref(false)

// ---- Authentication ----

function authAll(): AuthEntry | undefined {
  return (props.profile.auth as Record<string, AuthEntry> | undefined)?.all
}

/** Lazily create `profile.auth.all`, returning it. */
function ensureAuthAll(): AuthEntry {
  const p = props.profile as Record<string, unknown>
  if (p.auth == null) p.auth = {}
  const auth = p.auth as Record<string, AuthEntry>
  if (auth.all == null) auth.all = { username: '', password: '' }
  return auth.all
}

function setAuth(username: string, password: string): void {
  if (!username && !password) {
    const auth = props.profile.auth as Record<string, unknown> | undefined
    if (auth) {
      delete auth.all
      if (Object.keys(auth).length === 0) delete (props.profile as Record<string, unknown>).auth
    }
  } else {
    const all = ensureAuthAll()
    all.username = username
    all.password = password
  }
  touch()
}

const authUsername = computed<string>({
  get: () => authAll()?.username ?? '',
  set: (v) => setAuth(v, authAll()?.password ?? ''),
})
const authPassword = computed<string>({
  get: () => authAll()?.password ?? '',
  set: (v) => setAuth(authAll()?.username ?? '', v),
})

// ---- Bypass list ----

const bypassText = computed<string>({
  get: () => {
    const list = (props.profile.bypassList as BypassCondition[] | undefined) ?? []
    return list.map((c) => c.pattern).join('\n')
  },
  set: (v) => {
    const list: BypassCondition[] = v
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((pattern) => ({ conditionType: 'BypassCondition', pattern }))
    ;(props.profile as Record<string, unknown>).bypassList = list
    touch()
  },
})
</script>

<template>
  <div class="fixed-editor">
    <div class="card">
      <h2>{{ t('fixedProfile_mainProxy') || 'Proxy server' }}</h2>
      <div class="row proxy-row">
        <div class="field">
          <label>{{ t('fixedProfile_scheme') || 'Protocol' }}</label>
          <select v-model="fbScheme">
            <option
              v-for="s in SCHEMES"
              :key="s"
              :value="s"
            >
              {{ s }}
            </option>
          </select>
        </div>
        <div class="field grow">
          <label>{{ t('fixedProfile_host') || 'Server' }}</label>
          <input
            v-model="fbHost"
            type="text"
            placeholder="proxy.example.com"
          >
        </div>
        <div class="field port">
          <label>{{ t('fixedProfile_port') || 'Port' }}</label>
          <input
            v-model.number="fbPort"
            type="number"
            min="0"
            max="65535"
          >
        </div>
      </div>
    </div>

    <div class="card">
      <div class="row">
        <h2 class="spacer">
          {{ t('fixedProfile_advanced') || 'Advanced (per-protocol proxies)' }}
        </h2>
        <button
          class="btn ghost"
          type="button"
          @click="showAdvanced = !showAdvanced"
        >
          {{ showAdvanced ? (t('label_hide') || 'Hide') : (t('label_show') || 'Show') }}
        </button>
      </div>

      <template v-if="showAdvanced">
        <div class="field">
          <label>
            <input
              v-model="httpEnabled"
              type="checkbox"
            >
            {{ t('fixedProfile_proxyForHttp') || 'HTTP proxy' }}
          </label>
        </div>
        <div
          v-if="httpEnabled"
          class="row proxy-row"
        >
          <div class="field">
            <label>{{ t('fixedProfile_scheme') || 'Protocol' }}</label>
            <select v-model="httpScheme">
              <option
                v-for="s in SCHEMES"
                :key="s"
                :value="s"
              >
                {{ s }}
              </option>
            </select>
          </div>
          <div class="field grow">
            <label>{{ t('fixedProfile_host') || 'Server' }}</label>
            <input
              v-model="httpHost"
              type="text"
              placeholder="proxy.example.com"
            >
          </div>
          <div class="field port">
            <label>{{ t('fixedProfile_port') || 'Port' }}</label>
            <input
              v-model.number="httpPort"
              type="number"
              min="0"
              max="65535"
            >
          </div>
        </div>

        <div class="field">
          <label>
            <input
              v-model="httpsEnabled"
              type="checkbox"
            >
            {{ t('fixedProfile_proxyForHttps') || 'HTTPS proxy' }}
          </label>
        </div>
        <div
          v-if="httpsEnabled"
          class="row proxy-row"
        >
          <div class="field">
            <label>{{ t('fixedProfile_scheme') || 'Protocol' }}</label>
            <select v-model="httpsScheme">
              <option
                v-for="s in SCHEMES"
                :key="s"
                :value="s"
              >
                {{ s }}
              </option>
            </select>
          </div>
          <div class="field grow">
            <label>{{ t('fixedProfile_host') || 'Server' }}</label>
            <input
              v-model="httpsHost"
              type="text"
              placeholder="proxy.example.com"
            >
          </div>
          <div class="field port">
            <label>{{ t('fixedProfile_port') || 'Port' }}</label>
            <input
              v-model.number="httpsPort"
              type="number"
              min="0"
              max="65535"
            >
          </div>
        </div>

        <div class="field">
          <label>
            <input
              v-model="ftpEnabled"
              type="checkbox"
            >
            {{ t('fixedProfile_proxyForFtp') || 'FTP proxy' }}
          </label>
        </div>
        <div
          v-if="ftpEnabled"
          class="row proxy-row"
        >
          <div class="field">
            <label>{{ t('fixedProfile_scheme') || 'Protocol' }}</label>
            <select v-model="ftpScheme">
              <option
                v-for="s in SCHEMES"
                :key="s"
                :value="s"
              >
                {{ s }}
              </option>
            </select>
          </div>
          <div class="field grow">
            <label>{{ t('fixedProfile_host') || 'Server' }}</label>
            <input
              v-model="ftpHost"
              type="text"
              placeholder="proxy.example.com"
            >
          </div>
          <div class="field port">
            <label>{{ t('fixedProfile_port') || 'Port' }}</label>
            <input
              v-model.number="ftpPort"
              type="number"
              min="0"
              max="65535"
            >
          </div>
        </div>
      </template>
    </div>

    <div class="card">
      <h2>{{ t('fixedProfile_auth') || 'Authentication' }}</h2>
      <div class="row">
        <div class="field grow">
          <label>{{ t('fixedProfile_username') || 'Username' }}</label>
          <input
            v-model="authUsername"
            type="text"
            autocomplete="off"
          >
        </div>
        <div class="field grow">
          <label>{{ t('fixedProfile_password') || 'Password' }}</label>
          <input
            v-model="authPassword"
            type="password"
            autocomplete="off"
          >
        </div>
      </div>
    </div>

    <div class="card">
      <h2>{{ t('fixedProfile_bypass') || 'Bypass list' }}</h2>
      <div class="field">
        <label>
          {{ t('fixedProfile_bypassHint') || 'Servers to connect to directly, one pattern per line' }}
        </label>
        <textarea
          v-model="bypassText"
          class="bypass-text"
          rows="6"
          spellcheck="false"
          placeholder="127.0.0.1&#10;[::1]&#10;localhost"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.fixed-editor {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.proxy-row {
  align-items: flex-end;
}
.grow {
  flex: 1;
}
.port input {
  width: 6rem;
}
.bypass-text {
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  resize: vertical;
}
</style>
