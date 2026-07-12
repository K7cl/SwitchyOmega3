// profiles — the proxy profile model: creation, reference graph, matching,
// and compilation to PAC. Ported from omega-pac/src/profiles.coffee.
//
// Swaps: uglify-js AST -> ./pac_ast (AST_Raw -> A.Raw for verbatim PAC
// injection). Otherwise a faithful structural port.

import * as A from './pac_ast.js'
import { Conditions, type Condition, type OmegaRequest } from './conditions.js'
import { RuleList, type Rule } from './rule_list.js'
import { AttachedCache, Revision } from './utils.js'

export interface Proxy {
  scheme: string
  host: string
  port: number
}

export interface Profile {
  name: string
  profileType: string
  color?: string
  builtin?: boolean
  revision?: string
  [key: string]: unknown
}

export type Options = Record<string, Profile>

interface ProfileCache {
  analyzed?: unknown
  compiled?: A.Node
  directReferenceSet?: Record<string, string>
}

interface ProfileHandler {
  includable?: boolean | ((profile: Profile) => boolean)
  inclusive?: boolean
  create?(profile: Profile): void
  match?(profile: Profile, request: OmegaRequest, cache: ProfileCache): unknown
  compile(profile: Profile, cache: ProfileCache): A.Node
  analyze?(profile: Profile): unknown
  directReferenceSet?(profile: Profile): Record<string, string>
  replaceRef?(profile: Profile, fromName: string, toName: string): boolean
  updateUrl?(profile: Profile): string | undefined
  updateContentTypeHints?(): string[]
  update?(profile: Profile, data: string): boolean
}

interface ReferenceArgs {
  profileNotFound?: unknown
  out?: Record<string, string>
}

const profileCache = new AttachedCache<Profile, ProfileCache>((profile) => profile.revision)

export const Profiles = {
  builtinProfiles: {
    '+direct': { name: 'direct', profileType: 'DirectProfile', color: '#aaaaaa', builtin: true },
    '+system': { name: 'system', profileType: 'SystemProfile', color: '#000000', builtin: true },
  } as Record<string, Profile>,

  schemes: [
    { scheme: 'http', prop: 'proxyForHttp' },
    { scheme: 'https', prop: 'proxyForHttps' },
    { scheme: 'ftp', prop: 'proxyForFtp' },
    { scheme: '', prop: 'fallbackProxy' },
  ],

  pacProtocols: { http: 'PROXY', https: 'HTTPS', socks4: 'SOCKS', socks5: 'SOCKS5' } as Record<string, string>,

  formatByType: {
    SwitchyRuleListProfile: 'Switchy',
    AutoProxyRuleListProfile: 'AutoProxy',
  } as Record<string, string>,

  ruleListFormats: ['Switchy', 'AutoProxy'],

  parseHostPort(str: string, scheme: string): Proxy | undefined {
    const sep = str.lastIndexOf(':')
    if (sep < 0) return undefined
    const port = parseInt(str.substr(sep + 1)) || 80
    const host = str.substr(0, sep)
    if (!host) return undefined
    return { scheme, host, port }
  },

  pacResult(proxy?: Proxy): string {
    if (proxy) {
      if (proxy.scheme === 'socks5') {
        return `SOCKS5 ${proxy.host}:${proxy.port}; SOCKS ${proxy.host}:${proxy.port}`
      }
      return `${Profiles.pacProtocols[proxy.scheme]} ${proxy.host}:${proxy.port}`
    }
    return 'DIRECT'
  },

  isFileUrl(url?: string): boolean {
    return !!(url && url.substr(0, 5).toUpperCase() === 'FILE:')
  },

  nameAsKey(profileName: string | Profile): string {
    const name = typeof profileName !== 'string' ? profileName.name : profileName
    return '+' + name
  },

  byName(profileName: string | Profile, options?: Options): Profile | undefined {
    if (typeof profileName === 'string') {
      const key = Profiles.nameAsKey(profileName)
      return Profiles.builtinProfiles[key] ?? options?.[key]
    }
    return profileName
  },

  byKey(key: string | Profile, options?: Options): Profile | undefined {
    if (typeof key === 'string') {
      return Profiles.builtinProfiles[key] ?? options?.[key]
    }
    return key
  },

  each(options: Options, callback: (key: string, profile: Profile) => void): void {
    const charCodePlus = '+'.charCodeAt(0)
    for (const key of Object.keys(options)) {
      if (key.charCodeAt(0) === charCodePlus) callback(key, options[key])
    }
    for (const key of Object.keys(Profiles.builtinProfiles)) {
      if (key.charCodeAt(0) === charCodePlus) callback(key, Profiles.builtinProfiles[key])
    }
  },

  profileResult(profileName: string | Profile): A.Node {
    let key = Profiles.nameAsKey(profileName)
    if (key === '+direct') key = Profiles.pacResult()
    return new A.Str({ value: key })
  },

  isIncludable(profile: Profile): boolean {
    let includable = Profiles._handler(profile).includable
    if (typeof includable === 'function') includable = includable.call(Profiles, profile)
    return !!includable
  },
  isInclusive(profile: Profile): boolean {
    return !!Profiles._handler(profile).inclusive
  },

  updateUrl(profile: Profile): string | undefined {
    return Profiles._handler(profile).updateUrl?.call(Profiles, profile)
  },
  updateContentTypeHints(profile: Profile): string[] | undefined {
    return Profiles._handler(profile).updateContentTypeHints?.call(Profiles)
  },
  update(profile: Profile, data: string): boolean {
    return !!Profiles._handler(profile).update?.call(Profiles, profile, data)
  },

  tag(profile: Profile): unknown {
    return profileCache.getTag(profile)
  },

  create(profile: string | Profile, opt_profileType?: string): Profile {
    let p: Profile
    if (typeof profile === 'string') {
      p = { name: profile, profileType: opt_profileType as string }
    } else {
      p = profile
      if (opt_profileType) p.profileType = opt_profileType
    }
    const create = Profiles._handler(p).create
    if (!create) return p
    create.call(Profiles, p)
    return p
  },

  updateRevision(profile: Profile, revision?: string): void {
    profile.revision = revision ?? Revision.fromTime()
  },

  replaceRef(profile: Profile, fromName: string, toName: string): boolean {
    if (!Profiles.isInclusive(profile)) return false
    const handler = Profiles._handler(profile)
    return !!handler.replaceRef?.call(Profiles, profile, fromName, toName)
  },

  analyze(profile: Profile): ProfileCache {
    const cache = profileCache.get(profile, () => ({}) as ProfileCache)
    if (!Object.prototype.hasOwnProperty.call(cache, 'analyzed')) {
      const analyze = Profiles._handler(profile).analyze
      cache.analyzed = analyze?.call(Profiles, profile)
    }
    return cache
  },

  dropCache(profile: Profile): void {
    profileCache.drop(profile)
  },

  directReferenceSet(profile: Profile): Record<string, string> {
    if (!Profiles.isInclusive(profile)) return {}
    const cache = profileCache.get(profile, () => ({}) as ProfileCache)
    if (cache.directReferenceSet) return cache.directReferenceSet
    const handler = Profiles._handler(profile)
    cache.directReferenceSet = handler.directReferenceSet!.call(Profiles, profile)
    return cache.directReferenceSet
  },

  profileNotFound(name: string, action?: unknown): Profile | null {
    if (action == null) throw new Error(`Profile ${name} does not exist!`)
    if (typeof action === 'function') action = action(name)
    if (typeof action === 'object' && action != null && (action as Profile).profileType) {
      return action as Profile
    }
    switch (action) {
      case 'ignore':
        return null
      case 'dumb':
        return Profiles.create({
          name,
          profileType: 'VirtualProfile',
          defaultProfileName: 'direct',
        } as Profile)
    }
    throw action
  },

  allReferenceSet(
    profile: string | Profile,
    options: Options,
    opt_args?: ReferenceArgs,
  ): Record<string, string> {
    const originalProfile = profile
    let resolved = Profiles.byName(profile, options)
    resolved ??= Profiles.profileNotFound(
      typeof originalProfile === 'string' ? originalProfile : originalProfile.name,
      opt_args?.profileNotFound,
    ) ?? undefined
    const args: ReferenceArgs = opt_args ?? {}
    const hasOut = args.out != null
    const result = (args.out ??= {})
    if (resolved) {
      result[Profiles.nameAsKey(resolved.name)] = resolved.name
      for (const name of Object.values(Profiles.directReferenceSet(resolved))) {
        Profiles.allReferenceSet(name, options, args)
      }
    }
    if (!hasOut) delete args.out
    return result
  },

  referencedBySet(
    profile: string | Profile,
    options: Options,
    opt_args?: ReferenceArgs,
  ): Record<string, string> {
    const profileKey = Profiles.nameAsKey(profile)
    const args: ReferenceArgs = opt_args ?? {}
    const hasOut = args.out != null
    const result = (args.out ??= {})
    Profiles.each(options, (key, prof) => {
      if (Profiles.directReferenceSet(prof)[profileKey]) {
        result[key] = prof.name
        Profiles.referencedBySet(prof, options, args)
      }
    })
    if (!hasOut) delete args.out
    return result
  },

  validResultProfilesFor(profile: string | Profile, options: Options): Profile[] {
    const resolved = Profiles.byName(profile, options)
    if (!resolved || !Profiles.isInclusive(resolved)) return []
    const profileKey = Profiles.nameAsKey(resolved)
    const ref = Profiles.referencedBySet(resolved, options)
    ref[profileKey] = profileKey
    const result: Profile[] = []
    Profiles.each(options, (key, prof) => {
      if (!ref[key] && Profiles.isIncludable(prof)) result.push(prof)
    })
    return result
  },

  match(profile: Profile, request: OmegaRequest, opt_profileType?: string): unknown {
    const type = opt_profileType ?? profile.profileType
    const cache = Profiles.analyze(profile)
    const match = Profiles._handler(type).match
    return match?.call(Profiles, profile, request, cache)
  },

  compile(profile: Profile, opt_profileType?: string): A.Node {
    const type = opt_profileType ?? profile.profileType
    const cache = Profiles.analyze(profile)
    if (cache.compiled) return cache.compiled
    const handler = Profiles._handler(type)
    cache.compiled = handler.compile.call(Profiles, profile, cache)
    return cache.compiled
  },

  _handler(profileType: string | Profile): ProfileHandler {
    const typeName = typeof profileType !== 'string' ? profileType.profileType : profileType
    let handler: ProfileHandler | string | undefined = typeName
    while (typeof handler === 'string') {
      handler = profileTypes[handler]
    }
    if (!handler) throw new Error(`Unknown profile type: ${typeName}`)
    return handler
  },

  get _profileTypes(): Record<string, ProfileHandler | string> {
    return profileTypes
  },
}

const fnArgs = (): A.SymbolFunarg[] => [
  new A.SymbolFunarg({ name: 'url' }),
  new A.SymbolFunarg({ name: 'host' }),
  new A.SymbolFunarg({ name: 'scheme' }),
]

const profileTypes: Record<string, ProfileHandler | string> = {
  SystemProfile: {
    compile: () => {
      throw new Error('SystemProfile cannot be used in PAC scripts')
    },
  },

  DirectProfile: {
    includable: true,
    compile: () => new A.Str({ value: Profiles.pacResult() }),
  },

  FixedProfile: {
    includable: true,
    create: (profile) => {
      profile.bypassList ??= [
        { conditionType: 'BypassCondition', pattern: '127.0.0.1' },
        { conditionType: 'BypassCondition', pattern: '[::1]' },
        { conditionType: 'BypassCondition', pattern: 'localhost' },
      ]
    },
    match: (profile, request) => {
      const bypassList = profile.bypassList as Condition[] | undefined
      if (bypassList) {
        for (const cond of bypassList) {
          if (Conditions.match(cond, request)) {
            return [Profiles.pacResult(), cond, { scheme: 'direct' }, undefined]
          }
        }
      }
      const auth = profile.auth as Record<string, unknown> | undefined
      for (const s of Profiles.schemes) {
        if (s.scheme === request.scheme && profile[s.prop]) {
          return [
            Profiles.pacResult(profile[s.prop] as Proxy),
            s.scheme,
            profile[s.prop],
            auth?.[s.prop] ?? auth?.['all'],
          ]
        }
      }
      return [
        Profiles.pacResult(profile.fallbackProxy as Proxy | undefined),
        '',
        profile.fallbackProxy,
        auth?.['fallbackProxy'] ?? auth?.['all'],
      ]
    },
    compile: (profile) => {
      if (
        (!profile.bypassList || !profile.fallbackProxy) &&
        !profile.proxyForHttp &&
        !profile.proxyForHttps &&
        !profile.proxyForFtp
      ) {
        return new A.Str({ value: Profiles.pacResult(profile.fallbackProxy as Proxy | undefined) })
      }
      const body: A.Node[] = [new A.Directive({ value: 'use strict' })]
      const bypassList = profile.bypassList as Condition[] | undefined
      if (bypassList && bypassList.length) {
        let conditions: A.Node | null = null
        for (const cond of bypassList) {
          const condition = Conditions.compile(cond)
          conditions = conditions
            ? new A.Binary({ left: conditions, operator: '||', right: condition })
            : condition
        }
        body.push(
          new A.If({
            condition: conditions!,
            body: new A.Return({ value: new A.Str({ value: Profiles.pacResult() }) }),
          }),
        )
      }
      if (!profile.proxyForHttp && !profile.proxyForHttps && !profile.proxyForFtp) {
        body.push(
          new A.Return({ value: new A.Str({ value: Profiles.pacResult(profile.fallbackProxy as Proxy | undefined) }) }),
        )
      } else {
        body.push(
          new A.Switch({
            expression: new A.SymbolRef({ name: 'scheme' }),
            body: Profiles.schemes
              .filter((s) => !s.scheme || profile[s.prop])
              .map((s) => {
                const ret = [
                  new A.Return({ value: new A.Str({ value: Profiles.pacResult(profile[s.prop] as Proxy | undefined) }) }),
                ]
                return s.scheme
                  ? new A.Case({ expression: new A.Str({ value: s.scheme }), body: ret })
                  : new A.Default({ body: ret })
              }),
          }),
        )
      }
      return new A.FunctionExpr({ argnames: fnArgs(), body })
    },
  },

  PacProfile: {
    includable: (profile) => !Profiles.isFileUrl(profile.pacUrl as string | undefined),
    create: (profile) => {
      profile.pacScript ??= 'function FindProxyForURL(url, host) {\n  return "DIRECT";\n}'
    },
    compile: (profile) =>
      new A.Call({
        args: [new A.This()],
        expression: new A.Dot({
          property: 'call',
          expression: new A.FunctionExpr({
            argnames: [],
            body: [
              // See FelisCatus/SwitchyOmega#390: terminate any trailing line- or
              // block-comment in the user PAC before appending our own code.
              new A.Raw(';\n' + (profile.pacScript as string) + '\n\n/* End of PAC */;'),
              new A.Return({ value: new A.SymbolRef({ name: 'FindProxyForURL' }) }),
            ],
          }),
        }),
      }),
    updateUrl: (profile) =>
      Profiles.isFileUrl(profile.pacUrl as string | undefined) ? undefined : (profile.pacUrl as string),
    updateContentTypeHints: () => [
      '!text/html',
      '!application/xhtml+xml',
      'application/x-ns-proxy-autoconfig',
      'application/x-javascript-config',
    ],
    update: (profile, data) => {
      if (profile.pacScript === data) return false
      profile.pacScript = data
      return true
    },
  },
  AutoDetectProfile: 'PacProfile',

  SwitchProfile: {
    includable: true,
    inclusive: true,
    create: (profile) => {
      profile.defaultProfileName ??= 'direct'
      profile.rules ??= []
    },
    directReferenceSet: (profile) => {
      const refs: Record<string, string> = {}
      refs[Profiles.nameAsKey(profile.defaultProfileName as string)] = profile.defaultProfileName as string
      for (const rule of profile.rules as Rule[]) {
        refs[Profiles.nameAsKey(rule.profileName as string)] = rule.profileName as string
      }
      return refs
    },
    analyze: (profile) => profile.rules,
    replaceRef: (profile, fromName, toName) => {
      let changed = false
      if (profile.defaultProfileName === fromName) {
        profile.defaultProfileName = toName
        changed = true
      }
      for (const rule of profile.rules as Rule[]) {
        if (rule.profileName === fromName) {
          rule.profileName = toName
          changed = true
        }
      }
      return changed
    },
    match: (profile, request, cache) => {
      for (const rule of cache.analyzed as Rule[]) {
        if (Conditions.match(rule.condition, request)) return rule
      }
      return [Profiles.nameAsKey(profile.defaultProfileName as string), null]
    },
    compile: (profile, cache) => {
      const rules = cache.analyzed as Rule[]
      if (rules.length === 0) return Profiles.profileResult(profile.defaultProfileName as string)
      const body: A.Node[] = [new A.Directive({ value: 'use strict' })]
      for (const rule of rules) {
        body.push(
          new A.If({
            condition: Conditions.compile(rule.condition),
            body: new A.Return({ value: Profiles.profileResult(rule.profileName as string) }),
          }),
        )
      }
      body.push(new A.Return({ value: Profiles.profileResult(profile.defaultProfileName as string) }))
      return new A.FunctionExpr({ argnames: fnArgs(), body })
    },
  },
  VirtualProfile: 'SwitchProfile',

  RuleListProfile: {
    includable: true,
    inclusive: true,
    create: (profile) => {
      profile.profileType ??= 'RuleListProfile'
      profile.format ??= Profiles.formatByType[profile.profileType] ?? 'Switchy'
      profile.defaultProfileName ??= 'direct'
      profile.matchProfileName ??= 'direct'
      profile.ruleList ??= ''
    },
    directReferenceSet: (profile) => {
      if (profile.ruleList != null) {
        const format = profile.format as string
        const refs = RuleList[format]?.directReferenceSet?.(
          profile as unknown as { ruleList: string; matchProfileName?: string; defaultProfileName?: string },
        )
        if (refs) return refs
      }
      const refs: Record<string, string> = {}
      for (const name of [profile.matchProfileName as string, profile.defaultProfileName as string]) {
        refs[Profiles.nameAsKey(name)] = name
      }
      return refs
    },
    replaceRef: (profile, fromName, toName) => {
      let changed = false
      if (profile.defaultProfileName === fromName) {
        profile.defaultProfileName = toName
        changed = true
      }
      if (profile.matchProfileName === fromName) {
        profile.matchProfileName = toName
        changed = true
      }
      return changed
    },
    analyze: (profile) => {
      const format = (profile.format ?? Profiles.formatByType[profile.profileType]) as string
      const formatHandler = RuleList[format]
      if (!formatHandler) throw new Error(`Unsupported rule list format ${format}!`)
      let ruleList = (profile.ruleList as string | undefined)?.trim() || ''
      if ('preprocess' in formatHandler && formatHandler.preprocess) {
        ruleList = formatHandler.preprocess(ruleList)
      }
      return formatHandler.parse(
        ruleList,
        profile.matchProfileName as string,
        profile.defaultProfileName as string,
      )
    },
    match: (profile, request) => Profiles.match(profile, request, 'SwitchProfile'),
    compile: (profile) => Profiles.compile(profile, 'SwitchProfile'),
    updateUrl: (profile) => profile.sourceUrl as string | undefined,
    updateContentTypeHints: () => ['!text/html', '!application/xhtml+xml', 'text/plain', '*'],
    update: (profile, data) => {
      data = data.trim()
      const original = (profile.format ?? Profiles.formatByType[profile.profileType]) as string
      profile.profileType = 'RuleListProfile'
      let format: string | null = original
      if (RuleList[format].detect?.(data) === false) format = null
      for (const formatName of Object.keys(RuleList)) {
        const result = RuleList[formatName].detect?.(data)
        if (result === true || (result !== false && format == null)) {
          profile.format = format = formatName
        }
      }
      format ??= original
      const formatHandler = RuleList[format]
      if ('preprocess' in formatHandler && formatHandler.preprocess) {
        data = formatHandler.preprocess(data)
      }
      if (profile.ruleList === data) return false
      profile.ruleList = data
      return true
    },
  },
  SwitchyRuleListProfile: 'RuleListProfile',
  AutoProxyRuleListProfile: 'RuleListProfile',
}

export default Profiles
