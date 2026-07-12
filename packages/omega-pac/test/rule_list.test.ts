import { describe, it, expect } from 'vitest'
import { AutoProxy, Switchy } from '../src/rule_list.js'

describe('RuleList', () => {
  describe('AutoProxy', () => {
    const parse = AutoProxy.parse
    it('parses keyword conditions', () => {
      const line = 'example.com'
      const result = parse(line, 'match', 'notmatch')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ source: line, profileName: 'match', condition: { conditionType: 'KeywordCondition', pattern: 'example.com' } })
    })
    it('parses keyword conditions with asterisks', () => {
      const line = 'example*.com'
      const result = parse(line, 'match', 'notmatch')
      expect(result[0]).toEqual({ source: line, profileName: 'match', condition: { conditionType: 'UrlWildcardCondition', pattern: 'http://*example*.com*' } })
    })
    it('parses host conditions', () => {
      const line = '||example.com'
      const result = parse(line, 'match', 'notmatch')
      expect(result[0]).toEqual({ source: line, profileName: 'match', condition: { conditionType: 'HostWildcardCondition', pattern: '*.example.com' } })
    })
    it('parses "starts-with" conditions', () => {
      const line = '|https://ssl.example.com'
      const result = parse(line, 'match', 'notmatch')
      expect(result[0]).toEqual({ source: line, profileName: 'match', condition: { conditionType: 'UrlWildcardCondition', pattern: 'https://ssl.example.com*' } })
    })
    it('parses "starts-with" conditions for the HTTP scheme', () => {
      const line = '|http://example.com'
      const result = parse(line, 'match', 'notmatch')
      expect(result[0]).toEqual({ source: line, profileName: 'match', condition: { conditionType: 'UrlWildcardCondition', pattern: 'http://example.com*' } })
    })
    it('parses url regex conditions', () => {
      const line = '/^https?:\\/\\/[^\\/]+example.com/'
      const result = parse(line, 'match', 'notmatch')
      expect(result[0]).toEqual({ source: line, profileName: 'match', condition: { conditionType: 'UrlRegexCondition', pattern: '^https?:\\/\\/[^\\/]+example.com' } })
    })
    it('ignores comment lines', () => {
      expect(parse('!example.com', 'match', 'notmatch')).toHaveLength(0)
    })
    it('parses multiple lines', () => {
      const result = parse('example.com\n!comment\n||example.com', 'match', 'notmatch')
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ source: 'example.com', profileName: 'match', condition: { conditionType: 'KeywordCondition', pattern: 'example.com' } })
      expect(result[1]).toEqual({ source: '||example.com', profileName: 'match', condition: { conditionType: 'HostWildcardCondition', pattern: '*.example.com' } })
    })
    it('puts exclusive rules first', () => {
      const result = parse('example.com\n@@||example.com', 'match', 'notmatch')
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ source: '@@||example.com', profileName: 'notmatch', condition: { conditionType: 'HostWildcardCondition', pattern: '*.example.com' } })
      expect(result[1]).toEqual({ source: 'example.com', profileName: 'match', condition: { conditionType: 'KeywordCondition', pattern: 'example.com' } })
    })
  })

  describe('Switchy (legacy format)', () => {
    const parse = Switchy.parse
    const composeLegacy = (sections: Record<string, string[]>): string => {
      let list = '#BEGIN\r\n\r\n'
      for (const [sec, rules] of Object.entries(sections)) {
        list += `[${sec}]\r\n`
        for (const rule of rules) list += rule + '\r\n'
      }
      list += '\r\n\r\n#END\r\n'
      return list
    }
    it('parses empty rule lists', () => {
      expect(parse(composeLegacy({}), 'match', 'notmatch')).toHaveLength(0)
    })
    it('ignores stuff before #BEGIN or after #END', () => {
      let list = composeLegacy({})
      list += '[RegExp]\r\ntest\r\n'
      list = '[Wildcard]\r\ntest\r\n' + list
      expect(parse(list, 'match', 'notmatch')).toHaveLength(0)
    })
    it('parses wildcard rules', () => {
      const result = parse(composeLegacy({ Wildcard: ['*://example.com/abc/*'] }), 'match', 'notmatch')
      expect(result[0]).toEqual({ source: '*://example.com/abc/*', profileName: 'match', condition: { conditionType: 'UrlWildcardCondition', pattern: '*://example.com/abc/*' } })
    })
    it('parses RegExp rules', () => {
      const result = parse(composeLegacy({ RegExp: ['^http://www.example.com/.*'] }), 'match', 'notmatch')
      expect(result[0]).toEqual({ source: '^http://www.example.com/.*', profileName: 'match', condition: { conditionType: 'UrlRegexCondition', pattern: '^http://www.example.com/.*' } })
    })
    it('parses exclusive rules', () => {
      const result = parse(composeLegacy({ RegExp: ['!^http://www.example.com/.*'] }), 'match', 'notmatch')
      expect(result[0]).toEqual({ source: '!^http://www.example.com/.*', profileName: 'notmatch', condition: { conditionType: 'UrlRegexCondition', pattern: '^http://www.example.com/.*' } })
    })
    it('parses multiple rules in multiple sections', () => {
      const list = composeLegacy({
        Wildcard: ['http://www.example.com/*', 'http://example.com/*'],
        RegExp: ['^http://www.example.com/.*', '^http://example.com/.*'],
      })
      const result = parse(list, 'match', 'notmatch')
      expect(result).toHaveLength(4)
      expect(result[0].condition).toEqual({ conditionType: 'UrlWildcardCondition', pattern: 'http://www.example.com/*' })
      expect(result[2].condition).toEqual({ conditionType: 'UrlRegexCondition', pattern: '^http://www.example.com/.*' })
    })
    it('puts exclusive rules first', () => {
      const list = composeLegacy({ Wildcard: ['http://www.example.com/*'], RegExp: ['!^http://www.example.com/.*'] })
      const result = parse(list, 'match', 'notmatch')
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ source: '!^http://www.example.com/.*', profileName: 'notmatch', condition: { conditionType: 'UrlRegexCondition', pattern: '^http://www.example.com/.*' } })
      expect(result[1]).toEqual({ source: 'http://www.example.com/*', profileName: 'match', condition: { conditionType: 'UrlWildcardCondition', pattern: 'http://www.example.com/*' } })
    })
  })

  describe('Switchy (omega format)', () => {
    const parse = Switchy.parse
    const compose = Switchy.compose
    it('parses empty rule lists', () => {
      expect(parse(compose({ rules: [], defaultProfileName: 'notmatch' }), 'match', 'notmatch')).toHaveLength(0)
    })
    it('ignores comment lines', () => {
      let list = compose({ rules: [], defaultProfileName: 'notmatch' })
      list += ';*.example.com \r\n'
      expect(parse(list, 'match', 'notmatch')).toHaveLength(0)
    })
    it('composes and parses HostWildcardCondition', () => {
      const rule = { source: '*.example.com', condition: { conditionType: 'HostWildcardCondition', pattern: '*.example.com' }, profileName: 'match' }
      const list = compose({ rules: [rule], defaultProfileName: 'notmatch' })
      expect(parse(list, 'match', 'notmatch')[0]).toEqual(rule)
    })
    it('composes and parses HostRegexCondition', () => {
      const rule = { source: 'HostRegex: ^http://www.example.com/.*', condition: { conditionType: 'HostRegexCondition', pattern: '^http://www.example.com/.*' }, profileName: 'match' }
      const list = compose({ rules: [rule], defaultProfileName: 'notmatch' })
      expect(parse(list, 'match', 'notmatch')[0]).toEqual(rule)
    })
    it('composes and parses disabled rules', () => {
      const rule = { source: 'Disabled: *.example.com', condition: { conditionType: 'FalseCondition', pattern: '*.example.com' }, profileName: 'match' }
      const list = compose({ rules: [rule], defaultProfileName: 'notmatch' })
      expect(parse(list, 'match', 'notmatch')[0]).toEqual(rule)
    })
    it('composes and parses exclusive rules', () => {
      const rule = { source: '!*.example.com', condition: { conditionType: 'HostWildcardCondition', pattern: '*.example.com' }, profileName: 'notmatch' }
      const list = compose({ rules: [rule], defaultProfileName: 'notmatch' })
      expect(parse(list, 'match', 'notmatch')[0]).toEqual(rule)
    })
    it('composes and parses conditions starting with special chars', () => {
      const rule = { source: ': ;abc', condition: { conditionType: 'HostWildcardCondition', pattern: ';abc' }, profileName: 'match' }
      const list = compose({ rules: [rule], defaultProfileName: 'notmatch' })
      expect(parse(list, 'match', 'notmatch')[0]).toEqual(rule)
    })
    it('parses multiple conditions', () => {
      const rules = [
        { source: '*.example.com', condition: { conditionType: 'HostWildcardCondition', pattern: '*.example.com' }, profileName: 'match' },
        { source: '*.example.org', condition: { conditionType: 'HostWildcardCondition', pattern: '*.example.org' }, profileName: 'match' },
      ]
      const list = compose({ rules, defaultProfileName: 'notmatch' })
      expect(parse(list, 'match', 'notmatch')).toEqual(rules)
    })
    it('respects the top-down order', () => {
      const rules = [
        { source: 'b.example.com', condition: { conditionType: 'HostWildcardCondition', pattern: 'b.example.com' }, profileName: 'match' },
        { source: '!a.example.org', condition: { conditionType: 'HostWildcardCondition', pattern: 'a.example.org' }, profileName: 'notmatch' },
      ]
      const list = compose({ rules, defaultProfileName: 'notmatch' })
      expect(parse(list, 'match', 'notmatch')).toEqual(rules)
    })
    it('adds a default rule when results are enabled', () => {
      const list = compose({ rules: [], defaultProfileName: 'notmatch' }, { withResult: true })
      expect(list.split(/\r|\n/)).toContain('@with result')
      const result = parse(list, 'ignored', 'alsoIgnored')
      expect(result[0]).toEqual({ source: '*', condition: { conditionType: 'HostWildcardCondition', pattern: '*' }, profileName: 'notmatch' })
    })
    it('composes and parses conditions with results', () => {
      const rules = [
        { source: 'b.example.com', condition: { conditionType: 'HostWildcardCondition', pattern: 'b.example.com' }, profileName: 'abc' },
        { source: 'a.example.org', condition: { conditionType: 'HostWildcardCondition', pattern: 'a.example.org' }, profileName: 'def' },
      ]
      const list = compose({ rules, defaultProfileName: 'ghi' }, { withResult: true })
      const result = parse(list, 'ignored', 'alsoIgnored')
      rules.push({ source: '*', condition: { conditionType: 'HostWildcardCondition', pattern: '*' }, profileName: 'ghi' })
      expect(result).toEqual(rules)
    })
    it('composes and parses exclusive conditions with results', () => {
      const rules = [
        { source: '!b.example.com', condition: { conditionType: 'HostWildcardCondition', pattern: 'b.example.com' }, profileName: 'default profile' },
        { source: 'a.example.org', condition: { conditionType: 'HostWildcardCondition', pattern: 'a.example.org' }, profileName: 'some profile' },
      ]
      const list = compose({ rules, defaultProfileName: 'default profile' }, { withResult: true, useExclusive: true })
      const result = parse(list, 'ignored', 'alsoIgnored')
      rules.push({ source: '*', condition: { conditionType: 'HostWildcardCondition', pattern: '*' }, profileName: 'default profile' })
      expect(result).toEqual(rules)
    })
  })
})
