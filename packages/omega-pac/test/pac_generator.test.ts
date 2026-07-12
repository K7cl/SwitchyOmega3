import { describe, it, expect } from 'vitest'
import { PacGenerator } from '../src/pac_generator.js'
import type { Options } from '../src/profiles.js'

describe('PacGenerator', () => {
  const options: Options = {
    '+auto': {
      name: 'auto',
      profileType: 'SwitchProfile',
      revision: 'test',
      defaultProfileName: 'direct',
      rules: [
        { profileName: 'proxy', condition: { conditionType: 'UrlRegexCondition', pattern: '^http://(www|www2)\\.example\\.com/' } },
        { profileName: 'direct', condition: { conditionType: 'HostLevelsCondition', minValue: 3, maxValue: 8 } },
        { profileName: 'proxy', condition: { conditionType: 'KeywordCondition', pattern: 'keyword' } },
        { profileName: 'proxy', condition: { conditionType: 'UrlWildcardCondition', pattern: 'https://ssl.example.com/*' } },
      ],
    } as never,
    '+proxy': {
      name: 'proxy',
      profileType: 'FixedProfile',
      revision: 'test',
      fallbackProxy: { scheme: 'http', host: '127.0.0.1', port: 8888 },
      bypassList: [
        { conditionType: 'BypassCondition', pattern: '127.0.0.1:8080' },
        { conditionType: 'BypassCondition', pattern: '127.0.0.1' },
        { conditionType: 'BypassCondition', pattern: '<local>' },
      ],
    } as never,
  }

  const runPac = (pac: string): ((url: string, host: string) => string) =>
    eval(`(function () { ${pac}\n return FindProxyForURL; })()`)

  it('should generate pac scripts from options', () => {
    const ast = PacGenerator.script(options, 'auto')
    const pac = ast.print_to_string()
    expect(pac).not.toBe('')
    const func = runPac(pac)
    expect(func('http://www.example.com/', 'www.example.com')).toBe('PROXY 127.0.0.1:8888')
  })

  it('should be able to compress pac scripts', () => {
    const ast = PacGenerator.script(options, 'auto')
    const pac = PacGenerator.compress(ast).print_to_string()
    expect(pac).not.toBe('')
    const func = runPac(pac)
    expect(func('http://www.example.com/', 'www.example.com')).toBe('PROXY 127.0.0.1:8888')
  })
})
