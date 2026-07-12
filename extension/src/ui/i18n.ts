// i18n — thin wrapper over chrome.i18n for the UI.
//
// Returns '' for missing messages (not the key) so callers can use the
// `t('key') || 'fallback'` idiom. Full locale data is wired in Phase 7.

export function t(key: string, substitutions?: string | string[]): string {
  try {
    return chrome.i18n.getMessage(key, substitutions) || ''
  } catch {
    return ''
  }
}

/** Localized display name for a profile (built-ins have profile_* messages). */
export function dispName(name: string): string {
  return t('profile_' + name) || name
}
