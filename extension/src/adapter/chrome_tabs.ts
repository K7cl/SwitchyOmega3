// ChromeTabs — per-tab dynamic action icon/title. Ported from MV3 for
// omega-target-chromium-extension/src/module/tabs.coffee.
//
// The toolbar action shows the *effective result* for the active tab: as the
// user switches tabs (or a tab navigates), the icon is redrawn from the profile
// that actually matches that tab's URL (following the rule chain, including any
// per-domain temp rule). A single default action (from currentProfileChanged)
// is used as the global fallback and for chrome:// pages that have no URL rule.

import type { IconImageData } from './icon.js'

/** The action state to display: a redrawn icon plus the tooltip title. */
export interface TabAction {
  icon: IconImageData | null
  title: string
}

type ActionForUrl = (url: string) => Promise<TabAction | null>

export class ChromeTabs {
  private _defaultAction: TabAction | null = null
  // Tabs whose per-tab action is stale and must be recomputed when next seen.
  private _dirtyTabs: Record<number, boolean> = {}
  private readonly actionForUrl: ActionForUrl

  constructor(actionForUrl: ActionForUrl) {
    this.actionForUrl = actionForUrl
  }

  /** Register the tab listeners. Must run at the top level (cold-wake safe). */
  watch(): void {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this.onUpdated(tabId, changeInfo, tab)
    })
    chrome.tabs.onActivated.addListener((info) => {
      chrome.tabs
        .get(info.tabId)
        .then((tab) => {
          // Only recompute if this tab was marked stale by resetAll.
          if (Object.prototype.hasOwnProperty.call(this._dirtyTabs, info.tabId)) {
            this.onUpdated(tab.id ?? info.tabId, {}, tab)
          }
        })
        .catch(() => undefined)
    })
  }

  /**
   * The current profile changed: set a new default action and mark every tab
   * stale, so each is recomputed lazily when it next becomes active. The active
   * tab is refreshed immediately; the global icon/title is set as the fallback.
   */
  resetAll(action: TabAction): void {
    this._defaultAction = action
    chrome.tabs
      .query({})
      .then((tabs) => {
        this._dirtyTabs = {}
        for (const tab of tabs) {
          if (tab.id == null) continue
          this._dirtyTabs[tab.id] = true
          if (tab.active) this.onUpdated(tab.id, {}, tab)
        }
      })
      .catch(() => undefined)
    chrome.action.setTitle({ title: action.title }).catch(() => undefined)
    this.setIcon(action.icon)
  }

  onUpdated(
    _tabId: number,
    changeInfo: chrome.tabs.OnUpdatedInfo,
    tab: chrome.tabs.Tab,
  ): void {
    if (tab.id != null && Object.prototype.hasOwnProperty.call(this._dirtyTabs, tab.id)) {
      delete this._dirtyTabs[tab.id]
    } else if (changeInfo.url == null && changeInfo.status === 'complete') {
      // Nothing relevant changed and the tab is not stale — leave it alone.
      return
    }
    this.processTab(tab)
  }

  processTab(tab: chrome.tabs.Tab): void {
    const tabId = tab.id
    if (tabId == null) return
    // Internal pages (chrome://, chrome-extension://, …) have no URL rule: fall
    // back to the default action's title and icon.
    if (tab.url == null || tab.url.indexOf('chrome') === 0) {
      if (this._defaultAction) {
        chrome.action.setTitle({ title: this._defaultAction.title, tabId }).catch(() => undefined)
        this.clearIcon(tabId)
      }
      return
    }
    this.actionForUrl(tab.url)
      .then((action) => {
        if (!action) {
          this.clearIcon(tabId)
          return
        }
        this.setIcon(action.icon, tabId)
        return chrome.action.setTitle({ title: action.title, tabId })
      })
      .catch(() => undefined)
  }

  setIcon(icon: IconImageData | null, tabId?: number): void {
    if (!icon) return
    const params: chrome.action.TabIconDetails = { imageData: icon }
    if (tabId != null) params.tabId = tabId
    chrome.action.setIcon(params).catch(() => undefined)
  }

  /** Reset a tab to the default action's icon (used for internal pages). */
  clearIcon(tabId: number): void {
    const icon = this._defaultAction?.icon
    if (!icon) return
    chrome.action.setIcon({ imageData: icon, tabId }).catch(() => undefined)
  }
}
