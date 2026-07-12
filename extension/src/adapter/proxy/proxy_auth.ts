// proxy_auth — supplies proxy credentials for onAuthRequired challenges.
// Rewritten for MV3 from
// omega-target-chromium-extension/src/module/proxy/proxy_auth.coffee.
//
// MV3 cold-wake handling (docs/mv3-rewrite-plan.md §4.4): the handler is
// registered at the SW top level as 'asyncBlocking' so it can await storage.
// Credentials live in an in-memory map, mirrored to chrome.storage.session
// (memory-only — no new on-disk exposure beyond what the options already store).
// On a cold wake where the in-memory map is empty, the handler hydrates it from
// session before responding.

import { Profiles, type Profile } from '@switchyomega/omega-pac'
import type { LogType } from '@switchyomega/omega-core'

interface Credentials {
  username: string
  password: string
}
interface AuthEntry {
  auth: Credentials
  name: string
}
interface AuthCache {
  proxies: Record<string, AuthEntry[]>
  fallbacks: AuthEntry[]
}

const SESSION_KEY = 'omega.auth'

function keyForProxy(host: string, port: number | string): string {
  return `${String(host).toLowerCase()}:${port}`
}

/** Pure credential selection: pick the entry to try for this challenge/attempt. */
export function selectCredentials(
  cache: AuthCache,
  challengerKey: string,
  authTries: number,
): Credentials | undefined {
  const list = cache.proxies[challengerKey] ?? []
  const entry = authTries < list.length ? list[authTries] : cache.fallbacks[authTries - list.length]
  return entry?.auth
}

/** Build the credential cache from the referenced profiles' auth settings. */
export function buildAuthCache(profiles: Profile[]): AuthCache {
  const proxies: Record<string, AuthEntry[]> = {}
  const fallbacks: AuthEntry[] = []
  for (const profile of profiles) {
    const auth = profile.auth as Record<string, Credentials> | undefined
    if (!auth) continue
    for (const scheme of Profiles.schemes) {
      const proxy = profile[scheme.prop] as { host: string; port: number } | undefined
      const cred = auth[scheme.prop]
      if (!proxy || !cred) continue
      const key = keyForProxy(proxy.host, proxy.port)
      ;(proxies[key] ??= []).push({ auth: cred, name: `${profile.name}.${scheme.prop}` })
    }
    if (auth['all']) fallbacks.push({ auth: auth['all'], name: `${profile.name}.all` })
  }
  return { proxies, fallbacks }
}

export class ProxyAuth {
  private cache: AuthCache = { proxies: {}, fallbacks: [] }
  private requests: Record<string, { authTries: number }> = {}
  private listening = false
  private hydrated = false

  constructor(private log: LogType) {}

  /** Register the auth listeners at the SW top level (call once, synchronously). */
  listen(): void {
    if (this.listening) return
    if (!chrome.webRequest?.onAuthRequired) {
      this.log.error('Proxy auth disabled! onAuthRequired not available.')
      return
    }
    chrome.webRequest.onAuthRequired.addListener(
      this.authHandler as never,
      { urls: ['<all_urls>'] },
      ['asyncBlocking'],
    )
    chrome.webRequest.onCompleted.addListener(this.requestDone, { urls: ['<all_urls>'] })
    chrome.webRequest.onErrorOccurred.addListener(this.requestDone, { urls: ['<all_urls>'] })
    this.listening = true
  }

  /** Update credentials for the currently referenced profiles. */
  setProxies(profiles: Profile[]): void {
    this.cache = buildAuthCache(profiles)
    this.hydrated = true
    // Mirror to session so a respawned SW can answer before init completes.
    chrome.storage.session?.set({ [SESSION_KEY]: this.cache }).catch(() => undefined)
  }

  private async ensureHydrated(): Promise<void> {
    if (this.hydrated) return
    try {
      const s = await chrome.storage.session.get(SESSION_KEY)
      const cache = s[SESSION_KEY] as AuthCache | undefined
      if (cache) {
        this.cache = cache
        this.hydrated = true
      }
    } catch {
      /* session unavailable */
    }
  }

  private authHandler = (
    details: chrome.webRequest.OnAuthRequiredDetails,
    callback?: (response: chrome.webRequest.BlockingResponse) => void,
  ): void => {
    const respond = (response: chrome.webRequest.BlockingResponse): void => {
      if (callback) callback(response)
    }
    if (!details.isProxy) {
      respond({})
      return
    }
    const answer = (): void => {
      const req = (this.requests[details.requestId] ??= { authTries: 0 })
      const key = keyForProxy(details.challenger.host, details.challenger.port)
      const auth = selectCredentials(this.cache, key, req.authTries)
      this.log.log('ProxyAuth', key, req.authTries)
      if (!auth) {
        respond({})
        return
      }
      req.authTries++
      respond({ authCredentials: auth })
    }
    if (this.hydrated) answer()
    else this.ensureHydrated().then(answer)
  }

  private requestDone = (details: { requestId: string }): void => {
    delete this.requests[details.requestId]
  }
}
