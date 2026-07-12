// context_menu — a right-click action menu for quick profile switching.
// Rebuilt whenever the available-profiles state changes. Simplified from the
// legacy adapter (external-profile entries and inspect menu are omitted).

import type { Storage } from '@switchyomega/omega-core'
import type { ChromeOptions } from './chrome_options.js'

interface AvailableProfile {
  name: string
  profileType: string
  builtin?: boolean
}

function dispName(name: string): string {
  try {
    return chrome.i18n.getMessage('profile_' + name) || name
  } catch {
    return name
  }
}

const PROFILE_PREFIX = 'omega.profile.'

export function installContextMenus(options: ChromeOptions, state: Storage): void {
  const rebuild = (): void => {
    chrome.contextMenus.removeAll(() => {
      state.get({ availableProfiles: {} }).then(({ availableProfiles }) => {
        const profiles = (availableProfiles ?? {}) as Record<string, AvailableProfile>
        for (const key of Object.keys(profiles)) {
          const p = profiles[key]
          if (!p?.name || p.name.startsWith('__')) continue
          chrome.contextMenus.create({
            id: PROFILE_PREFIX + p.name,
            title: dispName(p.name),
            contexts: ['action'],
          })
        }
      })
    })
  }

  chrome.contextMenus.onClicked.addListener((info) => {
    const id = String(info.menuItemId)
    if (id.startsWith(PROFILE_PREFIX)) {
      options.ready?.then(() => options.applyProfile(id.slice(PROFILE_PREFIX.length)))
    }
  })

  options.ready?.then(rebuild)
  // Rebuild when the set of available profiles changes.
  state.watch(['availableProfiles'], () => rebuild())
}
