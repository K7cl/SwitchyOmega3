import { describe, it, expect } from 'vitest'
import { Profiles, type Options, type Profile } from '../src/profiles.js'
import { Conditions, type OmegaRequest } from '../src/conditions.js'

const ruleListResult = (profileName: string, source: string) => ({ profileName, source })

// Compiles a profile, evals its PAC, and checks both the interpreted match and
// the compiled result. Ported from omega-pac/test/profiles.coffee.
function testProfile(
  profile: Profile,
  request: string | OmegaRequest,
  expected: unknown,
  expectedCompiled?: string,
): void {
  const req: OmegaRequest = typeof request === 'string' ? Conditions.requestFromUrl(request) : request
  if (expectedCompiled === undefined) {
    expectedCompiled = Array.isArray(expected)
      ? (expected[0] as string)
      : Profiles.nameAsKey((expected as { profileName: string }).profileName)
  }

  const compiled = Profiles.compile(profile)
  let compileResult = eval('(' + compiled.print_to_string() + ')') as unknown
  if (typeof compileResult === 'function') {
    compileResult = (compileResult as (u: string, h: string, s: string) => string)(
      req.url,
      req.host,
      req.scheme,
    )
  }

  if (expected != null) {
    const matchResult = Profiles.match(profile, req) as Record<string, unknown>
    const exp = expected as Record<string, unknown>
    if (exp.source != null) {
      expect(matchResult.profileName).toBe(exp.profileName)
      expect(matchResult.source).toBe(exp.source)
    } else {
      expect(matchResult).toEqual(expected)
    }
  }

  expect(compileResult).toBe(expectedCompiled)
}

describe('Profiles', () => {
  describe('#pacResult', () => {
    it('returns DIRECT for no proxy', () => expect(Profiles.pacResult()).toBe('DIRECT'))
    it('returns a valid PAC result for a proxy', () =>
      expect(Profiles.pacResult({ scheme: 'http', host: '127.0.0.1', port: 8888 })).toBe('PROXY 127.0.0.1:8888'))
    it('returns a compatible result for SOCKS5', () =>
      expect(Profiles.pacResult({ scheme: 'socks5', host: '127.0.0.1', port: 8888 })).toBe(
        'SOCKS5 127.0.0.1:8888; SOCKS 127.0.0.1:8888',
      ))
  })

  describe('#byName', () => {
    it('gets builtin profiles', () => {
      const profile = Profiles.byName('direct')!
      expect(profile.profileType).toBe('DirectProfile')
    })
    it('gets profiles from given options', () => {
      const p = { name: 'profile', profileType: 'DirectProfile' } as Profile
      expect(Profiles.byName('profile', { '+profile': p } as Options)).toBe(p)
    })
  })

  describe('#allReferenceSet', () => {
    it('throws if a referenced profile does not exist', () => {
      const profile = Profiles.create('test', 'VirtualProfile')
      profile.defaultProfileName = 'bogus'
      expect(() => Profiles.allReferenceSet(profile, {})).toThrow(Error)
    })
    it('processes a dumb profile for each missing profile if requested', () => {
      const profile = Profiles.create('test', 'VirtualProfile')
      profile.defaultProfileName = 'bogus'
      const refs = Profiles.allReferenceSet(profile, {}, { profileNotFound: 'dumb' })
      expect(refs['+bogus']).toBe('bogus')
    })
  })

  describe('SystemProfile', () => {
    it('is builtin named "system"', () => expect(Profiles.byName('system')!.profileType).toBe('SystemProfile'))
    it('does not match requests', () =>
      expect(Profiles.match(Profiles.byName('system')!, { url: '', host: '', scheme: '' })).toBeUndefined())
    it('throws when compiled', () => expect(() => Profiles.compile(Profiles.byName('system')!)).toThrow())
  })

  describe('DirectProfile', () => {
    it('is builtin named "direct"', () => expect(Profiles.byName('direct')!.profileType).toBe('DirectProfile'))
    it('returns "DIRECT" when compiled', () =>
      testProfile(Profiles.byName('direct')!, { url: '', host: '', scheme: '' }, null, 'DIRECT'))
  })

  describe('FixedProfile', () => {
    const profile: Profile = {
      name: 'fixed',
      profileType: 'FixedProfile',
      bypassList: [{ conditionType: 'BypassCondition', pattern: '<local>' }],
      proxyForHttp: { scheme: 'socks4', host: '127.0.0.1', port: 1234 },
      proxyForHttps: { scheme: 'http', host: '127.0.0.1', port: 2345 },
      fallbackProxy: { scheme: 'socks4', host: '127.0.0.1', port: 3456 },
      auth: { proxyForHttps: { username: 'test', password: 'cheesecake' } },
    }
    it('uses protocol-specific proxies if suitable', () =>
      testProfile(profile, 'https://www.example.com/', ['PROXY 127.0.0.1:2345', 'https', profile.proxyForHttps, (profile.auth as Record<string, unknown>).proxyForHttps]))
    it('uses fallback proxies for other protocols', () =>
      testProfile(profile, 'ftp://www.example.com/', ['SOCKS 127.0.0.1:3456', '', profile.fallbackProxy, undefined]))
    it('does not return auth if not provided for the protocol', () =>
      testProfile(profile, 'http://www.example.com/', ['SOCKS 127.0.0.1:1234', 'http', profile.proxyForHttp, undefined]))
    it('uses no proxy for bypassList matches', () =>
      testProfile(profile, 'ftp://localhost/', ['DIRECT', (profile.bypassList as unknown[])[0], { scheme: 'direct' }, undefined]))
  })

  describe('PacProfile', () => {
    const profile = Profiles.create('test', 'PacProfile')
    profile.pacScript = 'function FindProxyForURL(url, host) {\n  return "PROXY " + host + ":8080";\n}'
    it('returns the result of the pac script', () =>
      testProfile(profile, 'ftp://www.example.com:9999/abc', null, 'PROXY www.example.com:8080'))
    it('does not fail for PAC with trailing comments', () => {
      let p = Profiles.create('test', 'PacProfile')
      p.pacScript = (profile.pacScript as string) + '\n// This is a trailing line comment.'
      testProfile(p, 'ftp://www.example.com:9999/abc', null, 'PROXY www.example.com:8080')
      p = Profiles.create('test', 'PacProfile')
      p.pacScript = (profile.pacScript as string) + '\n/* This is a multiline comment which is not properly closed.'
      testProfile(p, 'ftp://www.example.com:9999/abc', null, 'PROXY www.example.com:8080')
    })
    it('is includable for non-file pacUrl', () => expect(Profiles.isIncludable(profile)).toBe(true))
    it('is not includable for file: pacUrl', () => {
      const p = Profiles.create('test', 'PacProfile')
      p.pacUrl = 'file:///proxy.pac'
      expect(Profiles.isIncludable(p)).toBe(false)
    })
  })

  describe('SwitchProfile', () => {
    const profile = Profiles.create('test', 'SwitchProfile')
    profile.rules = [
      { condition: { conditionType: 'HostWildcardCondition', pattern: 'company.abc.example.com' }, profileName: 'company' },
      { condition: { conditionType: 'HostWildcardCondition', pattern: '*.example.com' }, profileName: 'example' },
      { condition: { conditionType: 'HostWildcardCondition', pattern: '*.abc.example.com' }, profileName: 'abc' },
    ]
    profile.defaultProfileName = 'default'
    const rules = profile.rules as Array<Record<string, unknown>>
    it('matches requests based on rules', () =>
      testProfile(profile, 'http://company.abc.example.com:998/abc', rules[0]))
    it('respects the order of rules', () => {
      testProfile(profile, 'http://abc.example.com:9999/abc', rules[1])
      testProfile(profile, 'http://www.example.com:9999/abc', rules[1])
    })
    it('returns defaultProfileName when no rules match', () =>
      testProfile(profile, 'http://www.example.org:9999/abc', ['+default', null]))
    it('calculates directly referenced profiles', () => {
      expect(Profiles.directReferenceSet(profile)).toEqual({ '+company': 'company', '+example': 'example', '+abc': 'abc', '+default': 'default' })
    })
    it('clears the reference cache on revision change', () => {
      profile.revision = 'a'
      Profiles.directReferenceSet(profile)
      profile.defaultProfileName = 'abc'
      profile.revision = 'b'
      expect(Profiles.directReferenceSet(profile)).toEqual({ '+company': 'company', '+example': 'example', '+abc': 'abc' })
    })
    it('clears the reference cache on explicit request', () => {
      profile.revision = 'a'
      Profiles.directReferenceSet(profile)
      profile.defaultProfileName = 'abc'
      Profiles.dropCache(profile)
      expect(Profiles.directReferenceSet(profile)).toEqual({ '+company': 'company', '+example': 'example', '+abc': 'abc' })
    })
  })

  describe('VirtualProfile', () => {
    const profile = Profiles.create('test', 'VirtualProfile')
    profile.defaultProfileName = 'default'
    it('always returns defaultProfileName', () =>
      testProfile(profile, 'http://www.example.com/abc', ['+default', null]))
  })

  describe('RuleListProfile', () => {
    const profile = Profiles.create('test', 'AutoProxyRuleListProfile')
    profile.defaultProfileName = 'default'
    profile.matchProfileName = 'example'
    profile.ruleList = 'example.com'
    profile.revision = 'a'
    it('calculates directly referenced profiles', () => {
      expect(Profiles.directReferenceSet(profile)).toEqual({ '+example': 'example', '+default': 'default' })
    })
    it('calculates referenced profiles for a rule list with results', () => {
      const set = Profiles.directReferenceSet({
        name: 'x',
        profileType: 'RuleListProfile',
        format: 'Switchy',
        matchProfileName: 'ignored',
        defaultProfileName: 'alsoIgnored',
        ruleList: '[SwitchyOmega Conditions]\n@with result\n!*.example.org\n*.example.com +ABC\n* +DEF',
      })
      expect(set).toEqual({ '+ABC': 'ABC', '+DEF': 'DEF' })
    })
    it('matches requests based on the rule list', () => {
      testProfile(profile, 'http://localhost/example.com', ruleListResult('example', 'example.com'))
      testProfile(profile, 'http://localhost/example.org', ['+default', null])
    })
    it('updates the rule list on update', () => {
      Profiles.update(profile, 'example.org')
      profile.revision = 'b'
      testProfile(profile, 'http://localhost/example.com', ['+default', null])
      testProfile(profile, 'http://localhost/example.org', ruleListResult('example', 'example.org'))
    })
    it('does not fail when ruleList is not provided', () => {
      const p: Profile = { name: 'p', profileType: 'RuleListProfile', format: 'Switchy', matchProfileName: 'match', defaultProfileName: 'default' }
      expect(typeof Profiles.directReferenceSet(p)).toBe('object')
      testProfile(p, 'http://localhost/example.com', ['+default', null])
    })
    it('switches to AutoProxy format on update if detected', () => {
      const p = Profiles.create('test2', 'RuleListProfile')
      p.format = 'Switchy'
      p.defaultProfileName = 'default'
      p.matchProfileName = 'example'
      expect(p.format).toBe('Switchy')
      Profiles.update(p, '[AutoProxy]\nexample.org')
      expect(p.format).toBe('AutoProxy')
      testProfile(p, 'http://localhost/example.com', ['+default', null])
      testProfile(p, 'http://localhost/example.org', ruleListResult('example', 'example.org'))
    })
  })
})
