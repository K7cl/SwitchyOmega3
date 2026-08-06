// ChromeOptions — the browser-specific Options subclass. Rewritten for MV3 from
// omega-target-chromium-extension/src/module/options.coffee. Trimmed features
// (element inspector, webRequest monitor, external API) are omitted per
// docs/decisions.md. The toolbar action shows a per-tab icon reflecting the
// effective result profile for that tab (via actionForUrl + ChromeTabs); the
// default action computed here is the global fallback.

import { Options } from '@switchyomega/omega-core'
import { Profiles, getBaseDomain, Conditions, type Profile } from '@switchyomega/omega-pac'
import { drawIcon, clearIconCache, type IconImageData } from './icon.js'
import type { TabAction } from './chrome_tabs.js'
import { fetchUrl } from './fetch_url.js'

const POPUP_PAGE = 'src/entries/popup/index.html'
const OPTIONS_PAGE = 'src/entries/options/index.html'

function msg(key: string, subst?: string | string[]): string {
  try {
    return chrome.i18n.getMessage(key, subst) || ''
  } catch {
    return ''
  }
}
function dispName(name: string): string {
  return msg('profile_' + name) || name
}
function refreshable(url: string | undefined): boolean {
  if (!url) return false
  return !(
    url.substr(0, 6) === 'chrome' ||
    url.substr(0, 6) === 'about:' ||
    url.substr(0, 4) === 'moz-'
  )
}

export class ChromeOptions extends Options {
  private _alarms: Record<string, () => void> | null = null
  private _proxyNotControllable: string | null = null
  private _badgeTitle: string | null = null
  // Per-tab action controller (ChromeTabs). Wired synchronously in background.ts
  // right after construction, before init()'s async currentProfileChanged fires.
  private _tabs?: { resetAll(action: TabAction): void }

  /** Wire the per-tab action controller (called once at boot). */
  setTabs(tabs: { resetAll(action: TabAction): void }): void {
    this._tabs = tabs
  }

  override fetchUrl(url: string, bypassCache?: boolean, typeHints?: string[]): Promise<string> {
    return fetchUrl(url, bypassCache, typeHints)
  }

  override schedule(name: string, periodInMinutes: number, callback: () => void): Promise<unknown> {
    const alarmName = 'omega.' + name
    if (!this._alarms) {
      this._alarms = {}
      chrome.alarms.onAlarm.addListener((alarm) => {
        this._alarms?.[alarm.name]?.()
      })
    }
    if (periodInMinutes < 0) {
      delete this._alarms[alarmName]
      chrome.alarms.clear(alarmName)
    } else {
      this._alarms[alarmName] = callback
      chrome.alarms.create(alarmName, { periodInMinutes })
    }
    return Promise.resolve()
  }

  /** Recreate all scheduled alarms after a browser restart (SW lost state). */
  reschedule(): void {
    if ((this._options['-downloadInterval'] as number) > 0) {
      this.schedule('updateProfile', this._options['-downloadInterval'] as number, () => {
        this.updateProfile()
      })
    }
  }

  override setQuickSwitch(quickSwitch: string[] | null, _canEnable: boolean): Promise<unknown> {
    // Cycle-on-click mode: clear the popup so chrome.action.onClicked fires.
    if (quickSwitch) {
      chrome.action.setPopup({ popup: '' })
    } else {
      chrome.action.setPopup({ popup: POPUP_PAGE })
    }
    chrome.contextMenus.update('enableQuickSwitch', { checked: !!quickSwitch }).catch(() => undefined)
    return Promise.resolve()
  }

  /** Re-assert the action popup after a wake (setPopup does not persist). */
  reassertPopup(): void {
    const enabled = this._options['-enableQuickSwitch']
    const profiles = this._options['-quickSwitchProfiles'] as string[] | undefined
    const cycling = !!enabled && !!profiles && profiles.length >= 2
    chrome.action.setPopup({ popup: cycling ? '' : POPUP_PAGE })
  }

  /** chrome.action.onClicked handler (cycle mode). Wired from background.ts. */
  onActionClicked(tab: chrome.tabs.Tab): Promise<unknown> {
    this.clearBadge()
    const profiles = this._options['-quickSwitchProfiles'] as string[] | undefined
    if (!this._options['-enableQuickSwitch'] || !profiles || profiles.length < 2) {
      // No cycle configured: open the popup page in a tab as a fallback.
      chrome.tabs.create({ url: POPUP_PAGE })
      return Promise.resolve()
    }
    let index = profiles.indexOf(this._currentProfileName ?? '')
    index = (index + 1) % profiles.length
    return this.applyProfile(profiles[index]).then(() => {
      if (this._options['-refreshOnProfileChange'] && refreshable(tab.url) && tab.id != null) {
        chrome.tabs.reload(tab.id)
      }
    })
  }

  proxyNotControllable(): string | null {
    return this._proxyNotControllable
  }
  setProxyNotControllable(reason: string | null): void {
    this._proxyNotControllable = reason
    if (reason) {
      this._state.set({ proxyNotControllable: reason })
      this.setBadge({ text: '=', color: '#da4f49' })
    } else {
      this._state.remove(['proxyNotControllable'])
      this.clearBadge()
    }
  }

  setBadge(options?: { text: string; color: string; title?: string }): void {
    const opts =
      options ??
      (this._proxyNotControllable ? { text: '=', color: '#da4f49' } : { text: '?', color: '#49afcd' })
    chrome.action.setBadgeText({ text: opts.text })
    chrome.action.setBadgeBackgroundColor({ color: opts.color })
    if (opts.title) {
      this._badgeTitle = opts.title
      chrome.action.setTitle({ title: opts.title })
    } else {
      this._badgeTitle = null
    }
  }
  clearBadge(): void {
    if (this._badgeTitle) this.currentProfileChanged('clearBadge')
    if (this._proxyNotControllable) this.setBadge()
    else chrome.action.setBadgeText({ text: '' })
  }

  private _external = false
  override currentProfileChanged(reason?: unknown): void {
    clearIconCache()
    if (reason === 'external') this._external = true
    else if (reason !== 'clearBadge') this._external = false

    const current = this.currentProfile()
    let currentName = ''
    let real: Profile | null | undefined = current
    if (current) {
      currentName = dispName(current.name)
      if (current.profileType === 'VirtualProfile') {
        const realName = current.defaultProfileName as string
        currentName += ` [${dispName(realName)}]`
        real = this.profile(realName) ?? current
      }
    }

    const details = real ? (this.printProfile(real) ?? '') : ''
    let title = currentName ? msg('browserAction_titleWithResult', [currentName, '', details]) : details
    if (this._external && real && real.profileType !== 'SystemProfile') {
      title = msg('browserAction_titleExternalProxy') + '\n' + title
      this.setBadge()
    }
    title = title || 'Proxy SwitchyOmega'

    let icon: IconImageData | null
    if (!real || !real.name || !Profiles.isInclusive(real)) {
      icon = drawIcon(real?.color ?? '#49afcd')
    } else {
      icon = drawIcon(real.color ?? '#49afcd', this.profile('direct')?.color)
    }

    const action: TabAction = { icon, title }
    if (this._tabs) {
      // Set the default action and refresh per-tab icons (active tab immediately).
      this._tabs.resetAll(action)
    } else {
      // No per-tab controller yet: set the global action directly.
      chrome.action.setTitle({ title }).catch(() => undefined)
      if (icon) chrome.action.setIcon({ imageData: icon }).catch(() => undefined)
    }
  }

  /** Attached rule lists and other internal profiles are hidden (name = __x). */
  private isHiddenName(name: string): boolean {
    return name.charCodeAt(0) === 95 && name.charCodeAt(1) === 95
  }

  /**
   * Compute the action (icon + tooltip) for a specific tab URL: resolve the
   * effective result profile by following the rule chain (temp rules included)
   * and redraw the two-tone icon so its inner disc reflects that result. Ported
   * from background.coffee's actionForUrl. Returns null if it cannot resolve.
   */
  async actionForUrl(url: string): Promise<TabAction | null> {
    try {
      await this.ready
      const request = Conditions.requestFromUrl(url)
      const { profile, results } = await this.matchProfile(request)
      if (!profile) return null

      let current = this.currentProfile()
      if (!current) return null
      let currentName = dispName(current.name)
      let realCurrentName: string | undefined
      if (current.profileType === 'VirtualProfile') {
        realCurrentName = current.defaultProfileName as string
        currentName += ` [${dispName(realCurrentName)}]`
        current = this.profile(realCurrentName) ?? current
      }

      const condition2Str = (condition: unknown): string => {
        const c = condition as { pattern?: string } | null | undefined
        return c?.pattern || Conditions.str(condition as never)
      }

      let details = ''
      let direct = false
      let attached = false
      for (const result of results as unknown[]) {
        if (Array.isArray(result)) {
          if (result[1] == null) {
            attached = false
            let name = result[0] as string
            if (name[0] === '+') name = name.substr(1)
            if (this.isHiddenName(name)) {
              attached = true
            } else if (name !== realCurrentName) {
              details += msg('browserAction_defaultRuleDetails')
              details += ` => ${dispName(name)}\n`
            }
          } else if ((result[1] as { length?: number }).length === 0) {
            if (result[0] === 'DIRECT') {
              details += msg('browserAction_directResult') + '\n'
              direct = true
            } else {
              details += `${result[0]}\n`
            }
          } else if (typeof result[1] === 'string') {
            details += `${result[1]} => ${result[0]}\n`
          } else {
            const raw = result[1] as { condition?: unknown }
            const condition = condition2Str(raw.condition ?? raw)
            details += `${condition} => `
            if (result[0] === 'DIRECT') {
              details += msg('browserAction_directResult') + '\n'
              direct = true
            } else {
              details += `${result[0]}\n`
            }
          }
        } else if ((result as { profileName?: string }).profileName) {
          const r = result as {
            profileName: string
            isTempRule?: boolean
            source?: string
            condition?: unknown
          }
          if (r.isTempRule) {
            details += msg('browserAction_tempRulePrefix')
          } else if (attached) {
            details += msg('browserAction_attachedPrefix')
            attached = false
          }
          const condition = r.source ?? condition2Str(r.condition)
          details += `${condition} => ${dispName(r.profileName)}\n`
        }
      }

      if (!details) details = this.printProfile(current) ?? ''

      // Icon: drawIcon(innerDisc, outerRing?). The original passes
      // drawIcon(outerRing, innerDisc), so the arguments are swapped here.
      let icon: IconImageData | null
      if (direct) {
        // Result resolves to DIRECT: inner = result color, outer = direct color.
        icon = drawIcon(profile.color ?? '#49afcd', this.profile('direct')?.color)
      } else if (profile.name === current.name && this.isCurrentProfileStatic()) {
        // Static current profile with no switching: single-tone.
        icon = drawIcon(profile.color ?? '#49afcd')
      } else {
        // Switched result: inner = current color, outer = result color.
        icon = drawIcon(current.color ?? '#49afcd', profile.color)
      }

      const title = msg('browserAction_titleWithResult', [
        currentName,
        dispName(profile.name),
        details,
      ])
      return { icon, title: title || 'Proxy SwitchyOmega' }
    } catch {
      return null
    }
  }

  printFixedProfile(profile: Profile): string | undefined {
    if (profile.profileType !== 'FixedProfile') return undefined
    let result = ''
    for (const scheme of Profiles.schemes) {
      if (profile[scheme.prop]) {
        const pacResult = Profiles.pacResult(profile[scheme.prop] as never)
        result += scheme.scheme ? `${scheme.scheme}: ${pacResult}\n` : `${pacResult}\n`
      }
    }
    return result || msg('browserAction_profileDetails_DirectProfile')
  }

  override printProfile(profile: Profile): string | null {
    let type = profile.profileType
    if (type.indexOf('RuleListProfile') >= 0) type = 'RuleListProfile'
    if (type === 'FixedProfile') return this.printFixedProfile(profile) ?? null
    if (type === 'PacProfile' && profile.pacUrl) return profile.pacUrl as string
    return msg('browserAction_profileDetails_' + type) || null
  }

  override onFirstRun(_reason: string): void {
    chrome.tabs.create({ url: chrome.runtime.getURL(OPTIONS_PAGE) })
  }

  /** Page info for the popup's per-domain rule feature. */
  getPageInfo({ url }: { url?: string }): {
    url?: string
    domain?: string
    tempRuleProfileName: string | null
  } {
    if (!url || !refreshable(url)) return { tempRuleProfileName: null }
    try {
      const hostname = new URL(url).hostname
      if (!hostname) return { tempRuleProfileName: null }
      const domain = getBaseDomain(hostname)
      return { url, domain, tempRuleProfileName: this.queryTempRule(domain) }
    } catch {
      return { tempRuleProfileName: null }
    }
  }
}
