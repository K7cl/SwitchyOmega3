// SettingsProxyImpl — applies profiles via chrome.proxy.settings (the standard,
// MV3-supported path). Ported from
// omega-target-chromium-extension/src/module/proxy/proxy_impl_settings.coffee.
// chromeApiPromisify dropped — chrome.proxy.settings.{set,get,clear} return
// promises in MV3. The Firefox listener/script impls are removed.

import { Profiles, Conditions, Revision, PacGenerator, type Profile } from '@switchyomega/omega-pac'
import type { OmegaOptions } from '@switchyomega/omega-core'
import { ProxyImpl } from './proxy_impl.js'

type ProxyServer = { scheme: string; host: string; port: number }

export class SettingsProxyImpl extends ProxyImpl {
  readonly features = ['fullUrlHttp', 'pacScript', 'watchProxyChange'] as const

  static isSupported(): boolean {
    return typeof chrome !== 'undefined' && !!chrome.proxy?.settings
  }

  private _proxyChangeWatchers: Array<(details: unknown) => void> | null = null

  override applyProfile(profile: Profile, meta: Profile, options: OmegaOptions): Promise<unknown> {
    meta ??= profile
    if (profile.profileType === 'SystemProfile') {
      // Clear proxy settings, returning control to Chromium.
      return chrome.proxy.settings.clear({}).then(() => {
        chrome.proxy.settings.get({}).then((d) => this._proxyChangeListener(d))
      })
    }

    const config: chrome.proxy.ProxyConfig = {} as chrome.proxy.ProxyConfig
    if (profile.profileType === 'DirectProfile') {
      config.mode = 'direct'
    } else if (profile.profileType === 'PacProfile') {
      config.mode = 'pac_script'
      const pacScript = profile.pacScript as string | undefined
      config.pacScript =
        !pacScript || Profiles.isFileUrl(profile.pacUrl as string | undefined)
          ? { url: profile.pacUrl as string, mandatory: true }
          : { data: PacGenerator.ascii(pacScript), mandatory: true }
    } else if (profile.profileType === 'FixedProfile') {
      Object.assign(config, this._fixedProfileConfig(profile))
    } else {
      config.mode = 'pac_script'
      config.pacScript = { mandatory: true, data: this.getProfilePacScript(profile, meta, options) }
    }

    return this.setProxyAuth(profile, options)
      .then(() => chrome.proxy.settings.set({ value: config }))
      .then(() => {
        chrome.proxy.settings.get({}).then((d) => this._proxyChangeListener(d))
      })
  }

  private _fixedProfileConfig(profile: Profile): chrome.proxy.ProxyConfig {
    const config: Record<string, unknown> = { mode: 'fixed_servers' }
    const rules: Record<string, unknown> = {}
    const protocols = ['proxyForHttp', 'proxyForHttps', 'proxyForFtp'] as const
    let protocolProxySet = false
    for (const protocol of protocols) {
      if (profile[protocol] != null) {
        rules[protocol] = profile[protocol]
        protocolProxySet = true
      }
    }

    const fallback = profile.fallbackProxy as ProxyServer | undefined
    if (fallback) {
      if (fallback.scheme === 'http') {
        // Chromium does not allow HTTP proxies in 'fallbackProxy'.
        if (!protocolProxySet) {
          rules['singleProxy'] = fallback
        } else {
          for (const protocol of protocols) {
            rules[protocol] ??= JSON.parse(JSON.stringify(fallback))
          }
        }
      } else {
        rules['fallbackProxy'] = fallback
      }
    } else if (!protocolProxySet) {
      config['mode'] = 'direct'
    }

    if (config['mode'] !== 'direct') {
      const bypassList: string[] = []
      for (const condition of (profile.bypassList as unknown[]) ?? []) {
        bypassList.push(this._formatBypassItem(condition))
      }
      rules['bypassList'] = bypassList
      config['rules'] = rules
    }
    return config as unknown as chrome.proxy.ProxyConfig
  }

  private _formatBypassItem(condition: unknown): string {
    const str = Conditions.str(condition as never)
    const i = str.indexOf(' ')
    return str.substr(i + 1)
  }

  private _proxyChangeListener = (details: unknown): void => {
    for (const watcher of this._proxyChangeWatchers ?? []) watcher(details)
  }

  override watchProxyChange(callback: (details: unknown) => void): void {
    if (this._proxyChangeWatchers == null) {
      this._proxyChangeWatchers = []
      chrome.proxy.settings.onChange?.addListener(this._proxyChangeListener)
    }
    this._proxyChangeWatchers.push(callback)
  }

  override parseExternalProfile(
    details: { name?: string; value: chrome.proxy.ProxyConfig },
    options: OmegaOptions,
  ): Profile | null {
    if (details.name) return details as unknown as Profile
    const value = details.value
    switch (value.mode) {
      case 'system':
        return Profiles.byName('system')!
      case 'direct':
        return Profiles.byName('direct')!
      case 'auto_detect':
        return Profiles.create({ profileType: 'PacProfile', name: '', pacUrl: 'http://wpad/wpad.dat' } as Profile)
      case 'pac_script':
        return this._parsePacScript(value, options)
      case 'fixed_servers':
        return this._parseFixedServers(value, options)
      default:
        return null
    }
  }

  private _parsePacScript(value: chrome.proxy.ProxyConfig, options: OmegaOptions): Profile {
    const url = value.pacScript?.url
    if (url) {
      let profile: Profile | null = null
      Profiles.each(options as never, (_key, p) => {
        if (p.profileType === 'PacProfile' && p.pacUrl === url) profile = p
      })
      return profile ?? Profiles.create({ profileType: 'PacProfile', name: '', pacUrl: url } as Profile)
    }
    let script = value.pacScript?.data ?? ''
    let found: Profile | null = null
    Profiles.each(options as never, (_key, p) => {
      if (p.profileType === 'PacProfile' && p.pacScript === script) found = p
    })
    if (found) return found
    script = script.trim()
    const magic = '/*OmegaProfile*'
    if (script.substr(0, magic.length) === magic) {
      const end = script.indexOf('*/')
      if (end > 0) {
        const tokens = script.substring(magic.length, end).split('*')
        let profileName: string | null = tokens[0]
        const revision = tokens[1]
        try {
          profileName = JSON.parse(profileName)
        } catch {
          profileName = null
        }
        if (profileName && revision) {
          const p = Profiles.byName(profileName, options as never)
          if (p && Revision.compare(p.revision, revision) === 0) return p
        }
      }
    }
    return Profiles.create({ profileType: 'PacProfile', name: '', pacScript: script } as Profile)
  }

  private _parseFixedServers(value: chrome.proxy.ProxyConfig, options: OmegaOptions): Profile {
    const props = ['proxyForHttp', 'proxyForHttps', 'proxyForFtp', 'fallbackProxy', 'singleProxy'] as const
    const rulesIn = (value.rules ?? {}) as Record<string, ProxyServer | undefined>
    const proxies: Record<string, string> = {}
    for (const prop of props) {
      const result = Profiles.pacResult(rulesIn[prop])
      if (prop === 'singleProxy' && rulesIn[prop] != null) proxies['fallbackProxy'] = result
      else proxies[prop] = result
    }
    const bypassSet: Record<string, boolean> = {}
    let bypassCount = 0
    for (const pattern of (rulesIn['bypassList'] as unknown as string[]) ?? []) {
      bypassSet[pattern] = true
      bypassCount++
    }
    if (bypassSet['<local>']) {
      for (const host of Conditions.localHosts) {
        if (bypassSet[host]) {
          delete bypassSet[host]
          bypassCount--
        }
      }
    }
    let match: Profile | null = null
    Profiles.each(options as never, (_key, p) => {
      if (p.profileType !== 'FixedProfile') return
      const bypass = (p.bypassList as Array<{ pattern: string }>) ?? []
      if (bypass.length !== bypassCount) return
      for (const condition of bypass) if (!bypassSet[condition.pattern]) return
      const rules = this._fixedProfileConfig(p).rules as Record<string, ProxyServer | undefined> | undefined
      if (!rules) return
      if (rules['singleProxy']) {
        rules['fallbackProxy'] = rules['singleProxy']
        delete rules['singleProxy']
      }
      for (const prop of props) {
        if (rules[prop] || proxies[prop]) {
          if (Profiles.pacResult(rules[prop]) !== proxies[prop]) return
        }
      }
      match = p
    })
    if (match) return match
    const profile = Profiles.create({ profileType: 'FixedProfile', name: '' } as Profile)
    for (const prop of props) {
      if (rulesIn[prop]) {
        if (prop === 'singleProxy') profile['fallbackProxy'] = rulesIn[prop]
        else profile[prop] = rulesIn[prop]
      }
    }
    profile.bypassList = Object.keys(bypassSet).map((pattern) => ({
      conditionType: 'BypassCondition',
      pattern,
    }))
    return profile
  }
}
