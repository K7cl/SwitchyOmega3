// Per-profile-type glyphicons, matching the original omega_decoration
// profileIcons map. Different proxy types get distinct icon shapes, tinted by
// the profile color, so they are visually distinguishable.

export const PROFILE_ICONS: Record<string, string> = {
  DirectProfile: 'glyphicon-transfer',
  SystemProfile: 'glyphicon-off',
  AutoDetectProfile: 'glyphicon-file',
  FixedProfile: 'glyphicon-globe',
  PacProfile: 'glyphicon-file',
  VirtualProfile: 'glyphicon-question-sign',
  RuleListProfile: 'glyphicon-list',
  SwitchProfile: 'glyphicon-retweet',
}

// Built-in profiles are referenced by name without a profileType — infer it.
const NAME_TYPE: Record<string, string> = {
  direct: 'DirectProfile',
  system: 'SystemProfile',
  auto_detect: 'AutoDetectProfile',
}

export interface ProfileLike {
  name?: string
  profileType?: string
  color?: unknown
}

export function iconForProfile(p?: ProfileLike): string {
  const type = p?.profileType || (p?.name ? NAME_TYPE[p.name] : undefined) || 'FixedProfile'
  return PROFILE_ICONS[type] || 'glyphicon-globe'
}

export function colorForProfile(p?: ProfileLike): string {
  return (p?.color as string) || '#888'
}

// Default colors for the built-in profiles (they have no entry in options).
export const BUILTIN_PROFILES: Array<{ name: string; profileType: string; color: string }> = [
  { name: 'direct', profileType: 'DirectProfile', color: '#999999' },
  { name: 'system', profileType: 'SystemProfile', color: '#666666' },
]
