import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import * as A from '../src/pac_ast.js'
import { Conditions, type Condition, type OmegaRequest } from '../src/conditions.js'

// Behavioral contract for the condition engine. For each case we assert that
// BOTH the interpreted matcher (Conditions.match) and the compiled PAC
// expression (eval'd here in the runner) agree with the expected result.
function testCond(
  condition: Condition,
  request: string | OmegaRequest,
  shouldMatch?: unknown,
): boolean {
  const should = !!shouldMatch
  const req: OmegaRequest =
    typeof request === 'string' ? Conditions.requestFromUrl(request) : request

  const matchResult = Conditions.match(condition, req)
  const condExpr = Conditions.compile(condition)
  const testFunc = new A.FunctionExpr({
    argnames: [
      new A.SymbolFunarg({ name: 'url' }),
      new A.SymbolFunarg({ name: 'host' }),
      new A.SymbolFunarg({ name: 'scheme' }),
    ],
    body: [new A.Return({ value: condExpr })],
  })
  const compiled = eval('(' + testFunc.print_to_string() + ')') as (
    url: string,
    host: string,
    scheme: string,
  ) => boolean
  const compileResult = compiled(req.url, req.host, req.scheme)

  const msg = `condition ${JSON.stringify(condition)} vs ${JSON.stringify(request)}`
  expect(matchResult, `interpreted: ${msg}`).toBe(should)
  expect(compileResult, `compiled: ${msg}`).toBe(should)
  return matchResult
}

describe('Conditions', () => {
  describe('TrueCondition', () => {
    it('should always return true', () => {
      testCond({ conditionType: 'TrueCondition' }, { url: '', host: '', scheme: '' }, 'match')
    })
  })
  describe('FalseCondition', () => {
    it('should always return false', () => {
      testCond({ conditionType: 'FalseCondition' }, { url: '', host: '', scheme: '' }, false)
    })
  })

  describe('UrlRegexCondition', () => {
    const cond: Condition = { conditionType: 'UrlRegexCondition', pattern: 'example\\.com' }
    it('matches by regex', () => testCond(cond, 'http://www.example.com/', 'match'))
    it('does not match otherwise', () => testCond(cond, 'http://www.example.net/', false))
    it('supports regex meta chars', () =>
      testCond({ conditionType: 'UrlRegexCondition', pattern: 'exam.*\\.com' }, 'http://www.example.com/', 'match'))
    it('falls back to not-match on invalid pattern', () =>
      testCond({ conditionType: 'UrlRegexCondition', pattern: ')Invalid(' }, 'http://www.example.com/', false))
  })

  describe('UrlWildcardCondition', () => {
    it('matches by wildcard', () =>
      testCond({ conditionType: 'UrlWildcardCondition', pattern: '*example.com*' }, 'http://www.example.com/', 'match'))
    it('does not match otherwise', () =>
      testCond({ conditionType: 'UrlWildcardCondition', pattern: '*example.com*' }, 'http://www.example.net/', false))
    it('supports question marks', () =>
      testCond({ conditionType: 'UrlWildcardCondition', pattern: '*exam???.com*' }, 'http://www.example.com/', 'match'))
    it('does not support regex meta chars', () =>
      testCond({ conditionType: 'UrlWildcardCondition', pattern: '.*example.com.*' }, 'http://example.com/', false))
    it('supports multiple patterns', () => {
      const cond: Condition = { conditionType: 'UrlWildcardCondition', pattern: '*.example.com/*|*.example.net/*' }
      testCond(cond, 'http://a.example.com/abc', 'match')
      testCond(cond, 'http://b.example.net/def', 'match')
      testCond(cond, 'http://c.example.org/ghi', false)
    })
  })

  describe('HostRegexCondition', () => {
    const cond: Condition = { conditionType: 'HostRegexCondition', pattern: '.*\\.example\\.com' }
    it('matches by regex', () => testCond(cond, 'http://www.example.com/', 'match'))
    it('does not match otherwise', () => testCond(cond, 'http://example.com/', false))
    it('does not match non-host URL parts', () =>
      expect(testCond(cond, 'http://example.net/www.example.com')).toBe(false))
  })

  describe('HostWildcardCondition', () => {
    const cond: Condition = { conditionType: 'HostWildcardCondition', pattern: '*.example.com' }
    it('matches by wildcard', () => testCond(cond, 'http://www.example.com/', 'match'))
    it('matches hostname without the optional level', () => testCond(cond, 'http://example.com/', 'match'))
    it('processes *.*example.com correctly', () => {
      const con: Condition = { conditionType: 'HostWildcardCondition', pattern: '*.*example.com' }
      testCond(con, 'http://example.com/', 'match')
      testCond(con, 'http://www.example.com/', 'match')
      testCond(con, 'http://www.some-example.com/', 'match')
      testCond(con, 'http://xample.com/', false)
    })
    it('allows overriding the magical behavior', () => {
      const con: Condition = { conditionType: 'HostWildcardCondition', pattern: '**.example.com' }
      testCond(con, 'http://www.example.com/', 'match')
      testCond(con, 'http://example.com/', false)
    })
    it('does not match non-host URL parts', () =>
      expect(testCond(cond, 'http://example.net/www.example.com')).toBe(false))
    it('supports multiple patterns', () => {
      const c: Condition = { conditionType: 'HostWildcardCondition', pattern: '*.example.com|*.example.net' }
      testCond(c, 'http://a.example.com/abc', 'match')
      testCond(c, 'http://example.net/def', 'match')
      testCond(c, 'http://c.example.org/ghi', false)
    })
  })

  describe('BypassCondition', () => {
    it('supports patterns containing hosts', () => {
      const cond: Condition = { conditionType: 'BypassCondition', pattern: '.example.com' }
      testCond(cond, 'http://www.example.com/', 'match')
      testCond(cond, 'http://example.com/', false)
      cond.pattern = '*.example.com'
      testCond(cond, 'http://www.example.com/', 'match')
      testCond(cond, 'http://example.com/', false)
      cond.pattern = 'example.com'
      testCond(cond, 'http://example.com/', 'match')
      testCond(cond, 'http://www.example.com/', false)
      cond.pattern = '*example.com'
      testCond(cond, 'http://example.com/', 'match')
      testCond(cond, 'http://www.example.com/', 'match')
      testCond(cond, 'http://anotherexample.com/', 'match')
    })
    it('matches the scheme', () => {
      const cond: Condition = { conditionType: 'BypassCondition', pattern: 'http://example.com' }
      testCond(cond, 'http://example.com/', 'match')
      testCond(cond, 'https://example.com/', false)
    })
    it('matches the port', () => {
      const cond: Condition = { conditionType: 'BypassCondition', pattern: 'http://example.com:8080' }
      testCond(cond, 'http://example.com:8080/', 'match')
      testCond(cond, 'http://example.com:888/', false)
    })
    it('supports IPv4 literals', () => {
      const cond: Condition = { conditionType: 'BypassCondition', pattern: 'http://127.0.0.1:8080' }
      testCond(cond, 'http://127.0.0.1:8080/', 'match')
      testCond(cond, 'http://127.0.0.2:8080/', false)
    })
    it('supports IPv6 canonicalization', () => {
      const cond: Condition = { conditionType: 'BypassCondition', pattern: 'http://[0:0::1]:8080' }
      testCond(cond, 'http://[::1]:8080/', 'match')
      testCond(cond, 'http://[1::1]:8080/', false)
    })
    it('supports IPv6 canonicalization 2', () => {
      const cond: Condition = { conditionType: 'BypassCondition', pattern: '[::1]' }
      testCond(cond, 'http://[::1]:8080/', 'match')
      testCond(cond, 'http://[1::1]:8080/', false)
    })

    it('parses IPv4 CIDR notation', () => {
      const cond: Condition = { conditionType: 'BypassCondition', pattern: '192.168.0.0/16' }
      const result = Conditions.analyze(cond).analyzed as { ip: unknown }
      expect(result.ip).toEqual({ conditionType: 'IpCondition', ip: '192.168.0.0', prefixLength: 16 })
    })
    it('parses IPv6 CIDR notation', () => {
      const cond: Condition = { conditionType: 'BypassCondition', pattern: 'fefe:13::abc/33' }
      const result = Conditions.analyze(cond).analyzed as { ip: unknown }
      expect(result.ip).toEqual({ conditionType: 'IpCondition', ip: 'fefe:13::abc', prefixLength: 33 })
    })
    it('parses IPv6 CIDR notation with zero prefixLength', () => {
      const cond: Condition = { conditionType: 'BypassCondition', pattern: '::/0' }
      const result = Conditions.analyze(cond).analyzed as { ip: unknown }
      expect(result.ip).toEqual({ conditionType: 'IpCondition', ip: '::', prefixLength: 0 })
    })

    it('matches 127.0.0.1 for <local>', () =>
      testCond({ conditionType: 'BypassCondition', pattern: '<local>' }, 'http://127.0.0.1:8080/', 'match'))
    it('matches [::1] for <local>', () =>
      testCond({ conditionType: 'BypassCondition', pattern: '<local>' }, 'http://[::1]:8080/', 'match'))
    it('matches any dotless host for <local>', () => {
      const cond: Condition = { conditionType: 'BypassCondition', pattern: '<local>' }
      testCond(cond, 'http://localhost:8080/', 'match')
      testCond(cond, 'http://intranet:8080/', 'match')
      testCond(cond, 'http://foobar/', 'match')
      testCond(cond, 'http://example.com/', false)
      testCond(cond, 'http://[::ffff:eeee]/', 'match')
      // WHATWG URL (and Chrome's PAC engine) canonicalize [::1.2.3.4] to the
      // dotless hex form [::102:304], so <local> matches it. The legacy suite
      // expected "not match" only because Node's deprecated url.parse preserved
      // the dotted form — which never reached the real PAC runtime.
      testCond(cond, 'http://[::1.2.3.4]/', 'match')
    })
  })

  describe('IpCondition', () => {
    it('supports IPv4 subnet', () => {
      const cond: Condition = { conditionType: 'IpCondition', ip: '192.168.1.1', prefixLength: 16 }
      const request = Conditions.requestFromUrl('http://192.168.4.4/')
      expect(Conditions.match(cond, request)).toBe(true)
      const compiled = Conditions.compile(cond).print_to_string()
      expect(compiled).toContain('isInNet(host,"192.168.1.1","255.255.0.0")')
    })
    it('supports IPv6 subnet', () => {
      const cond: Condition = { conditionType: 'IpCondition', ip: 'fefe:13::abc', prefixLength: 33 }
      const request = Conditions.requestFromUrl('http://[fefe:13::def]/')
      expect(Conditions.match(cond, request)).toBe(true)
      const compiled = Conditions.compile(cond).print_to_string()
      expect(compiled).toContain('isInNet(host,"fefe:13::abc","ffff:ffff:8000::")')
      expect(compiled).toContain('isInNetEx(host,"fefe:13::abc/33")')
    })
    it('supports IPv6 subnet with zero prefixLength', () => {
      const cond: Condition = { conditionType: 'IpCondition', ip: '::', prefixLength: 0 }
      const request = Conditions.requestFromUrl('http://[fefe:13::def]/')
      expect(Conditions.match(cond, request)).toBe(true)
      expect(Conditions.compile(cond).print_to_string().indexOf('indexOf(')).toBeGreaterThan(0)
    })
    it('does not match a domain name to an IP subnet', () => {
      const cond: Condition = { conditionType: 'IpCondition', ip: '::', prefixLength: 0 }
      const request = Conditions.requestFromUrl('http://www.example.com/')
      expect(Conditions.match(cond, request)).toBe(false)
    })
    it('does not pass domain names to isInNet', () => {
      const ipToCompiledFunc = (ip: string, prefixLen: number) => {
        const cond: Condition = { conditionType: 'IpCondition', ip, prefixLength: prefixLen }
        const dummyIsInNet = new A.FunctionExpr({ argnames: [], body: [new A.Return({ value: new A.True() })] })
        const testFunc = new A.FunctionExpr({
          argnames: [
            new A.SymbolFunarg({ name: 'url' }),
            new A.SymbolFunarg({ name: 'host' }),
            new A.SymbolFunarg({ name: 'scheme' }),
          ],
          body: [
            new A.Var({ definitions: [new A.VarDef({ name: new A.SymbolVar({ name: 'isInNet' }), value: dummyIsInNet })] }),
            new A.Return({ value: Conditions.compile(cond) }),
          ],
        })
        return eval('(' + testFunc.print_to_string() + ')') as (url: unknown, host: string) => boolean
      }

      let f = ipToCompiledFunc('0.0.0.0', 0)
      expect(f(null, 'www.example.com')).toBe(false)
      expect(f(null, '127.0.0.1')).toBe(true)
      f = ipToCompiledFunc('0.0.0.0', 1)
      expect(f(null, 'www.example.com')).toBe(false)
      expect(f(null, '127.0.0.1')).toBe(true)
      f = ipToCompiledFunc('::', 0)
      expect(f(null, 'www.example.com')).toBe(false)
      expect(f(null, '::1')).toBe(true)
      f = ipToCompiledFunc('::', 1)
      expect(f(null, 'www.example.com')).toBe(false)
      expect(f(null, '::1')).toBe(true)
    })
  })

  describe('KeywordCondition', () => {
    const cond: Condition = { conditionType: 'KeywordCondition', pattern: 'example.com' }
    it('matches by substring', () => {
      testCond(cond, 'http://www.example.com/', 'match')
      testCond(cond, 'http://www.example.net/', false)
    })
    it('does not match HTTPS', () => {
      testCond(cond, 'https://example.com/', false)
      testCond(cond, 'https://example.net/', false)
    })
  })

  describe('WeekdayCondition', () => {
    beforeAll(() => vi.useFakeTimers())
    afterAll(() => vi.useRealTimers())
    const testCondDay = (cond: Condition, day: number, match: unknown) => {
      const date = day > 0 ? day : 7
      vi.setSystemTime(new Date(`2016-02-0${date}T00:00:00Z`).getTime())
      testCond(cond, `http://weekday-${day}/`, match)
    }
    it('matches by date range', () => {
      const cond: Condition = { conditionType: 'WeekdayCondition', startDay: 3, endDay: 5 }
      testCondDay(cond, 0, false)
      testCondDay(cond, 1, false)
      testCondDay(cond, 2, false)
      testCondDay(cond, 3, 'match')
      testCondDay(cond, 4, 'match')
      testCondDay(cond, 5, 'match')
      testCondDay(cond, 6, false)
    })
    it('matches when startDay == endDay', () => {
      const cond: Condition = { conditionType: 'WeekdayCondition', startDay: 3, endDay: 3 }
      testCondDay(cond, 2, false)
      testCondDay(cond, 3, 'match')
      testCondDay(cond, 4, false)
    })
    it('matches nothing when startDay > endDay', () => {
      const cond: Condition = { conditionType: 'WeekdayCondition', startDay: 4, endDay: 3 }
      for (let d = 0; d <= 6; d++) testCondDay(cond, d, false)
    })
    it('matches according to .days', () => {
      let cond: Condition = { conditionType: 'WeekdayCondition', days: 'SMTWtFs' }
      for (let d = 0; d <= 6; d++) testCondDay(cond, d, 'match')
      cond = { conditionType: 'WeekdayCondition', days: 'S-TW-F-' }
      testCondDay(cond, 0, 'match')
      testCondDay(cond, 1, false)
      testCondDay(cond, 2, 'match')
      testCondDay(cond, 3, 'match')
      testCondDay(cond, 4, false)
      testCondDay(cond, 5, 'match')
      testCondDay(cond, 6, false)
    })
    it('prefers .days over start/end', () => {
      const cond: Condition = { conditionType: 'WeekdayCondition', days: '--TW---', startDay: 0, endDay: 0 }
      testCondDay(cond, 1, false)
      testCondDay(cond, 2, 'match')
      testCondDay(cond, 3, 'match')
      testCondDay(cond, 4, false)
    })
  })

  describe('TimeCondition', () => {
    beforeAll(() => vi.useFakeTimers())
    afterAll(() => vi.useRealTimers())
    const testCondTime = (cond: Condition, time: string, match: unknown) => {
      vi.setSystemTime(new Date(`01 Feb 2016 ${time}`).getTime())
      // TimeCondition ignores the request; use a valid URL (colons in the path).
      testCond(cond, `http://time/${time}`, match)
    }
    it('matches by hour range', () => {
      const cond: Condition = { conditionType: 'TimeCondition', startHour: 7, endHour: 9 }
      testCondTime(cond, '06:00:00', false)
      testCondTime(cond, '07:00:00', 'match')
      testCondTime(cond, '09:59:59', 'match')
      testCondTime(cond, '10:00:00', false)
    })
    it('matches when startHour == endHour', () => {
      const cond: Condition = { conditionType: 'TimeCondition', startHour: 7, endHour: 7 }
      testCondTime(cond, '06:00:00', false)
      testCondTime(cond, '07:00:00', 'match')
      testCondTime(cond, '07:59:59', 'match')
      testCondTime(cond, '08:00:00', false)
    })
    it('matches nothing when startHour > endHour', () => {
      const cond: Condition = { conditionType: 'TimeCondition', startHour: 7, endHour: 6 }
      testCondTime(cond, '06:00:00', false)
      testCondTime(cond, '07:00:00', false)
      testCondTime(cond, '08:00:00', false)
    })
  })

  describe('#typeFromAbbr', () => {
    it('gets condition types by abbrs', () => {
      expect(Conditions.typeFromAbbr('True')).toBe('TrueCondition')
      expect(Conditions.typeFromAbbr('HR')).toBe('HostRegexCondition')
    })
  })

  describe('#str and #fromStr', () => {
    const roundtrip = (condition: Condition, expected: string) => {
      const result = Conditions.str(condition)
      expect(result).toBe(expected)
      return Conditions.fromStr(result)
    }
    it('TrueCondition', () => {
      const condition: Condition = { conditionType: 'TrueCondition' }
      expect(roundtrip(condition, 'True:')).toEqual(condition)
    })
    it('condition with pattern', () => {
      const condition: Condition = { conditionType: 'UrlWildcardCondition', pattern: '*://*.example.com/*' }
      expect(roundtrip(condition, 'UrlWildcard: ' + condition.pattern)).toEqual(condition)
    })
    it('False preserving pattern', () => {
      const condition: Condition = { conditionType: 'FalseCondition', pattern: 'a b c' }
      expect(roundtrip(condition, 'Disabled: a b c')).toEqual(condition)
    })
    it('FalseCondition without pattern', () => {
      const condition: Condition = { conditionType: 'FalseCondition' }
      expect(roundtrip(condition, 'Disabled:')).toEqual(condition)
    })
    it('HostWildcard shorthand', () => {
      const condition: Condition = { conditionType: 'HostWildcardCondition', pattern: '*.example.com' }
      expect(roundtrip(condition, condition.pattern!)).toEqual(condition)
    })
    it('HostWildcard ending with colon', () => {
      const condition: Condition = { conditionType: 'HostWildcardCondition', pattern: 'bogus:' }
      expect(roundtrip(condition, 'HostWildcard: ' + condition.pattern)).toEqual(condition)
    })
    it('BypassCondition', () => {
      const condition: Condition = { conditionType: 'BypassCondition', pattern: '127.0.0.1/16' }
      expect(roundtrip(condition, 'Bypass: 127.0.0.1/16')).toEqual(condition)
    })
    it('adds brackets for IPv6 hosts', () => {
      const condition: Condition = { conditionType: 'BypassCondition', pattern: '::1' }
      const cond = roundtrip(condition, 'Bypass: [::1]')!
      expect(cond.conditionType).toBe('BypassCondition')
      expect(cond.pattern).toBe('[::1]')
    })
    it('adds brackets for IPv6 hosts with scheme', () => {
      const condition: Condition = { conditionType: 'BypassCondition', pattern: 'http://::1' }
      const cond = roundtrip(condition, 'Bypass: http://[::1]')!
      expect(cond.conditionType).toBe('BypassCondition')
      expect(cond.pattern).toBe('http://[::1]')
    })
    it('IpCondition', () => {
      const condition: Condition = { conditionType: 'IpCondition', ip: '127.0.0.1', prefixLength: 16 }
      expect(roundtrip(condition, 'Ip: 127.0.0.1/16')).toEqual(condition)
    })
    it('IpCondition invalid fallbacks', () => {
      expect(Conditions.fromStr('Ip: foo/-233')).toEqual({ conditionType: 'IpCondition', ip: '0.0.0.0', prefixLength: 0 })
      expect(Conditions.fromStr('Ip: nonsense stuff')).toEqual({ conditionType: 'IpCondition', ip: '0.0.0.0', prefixLength: 0 })
    })
    it('IpCondition without prefixLength assumes full match', () => {
      expect(Conditions.fromStr('Ip: 127.0.0.1')).toEqual({ conditionType: 'IpCondition', ip: '127.0.0.1', prefixLength: 32 })
      expect(Conditions.fromStr('Ip: ::1')).toEqual({ conditionType: 'IpCondition', ip: '::1', prefixLength: 128 })
    })
    it('IpCondition zero-prefix fallback', () => {
      expect(Conditions.fromStr('Ip: 0.0.0.0/-233')).toEqual({ conditionType: 'IpCondition', ip: '0.0.0.0', prefixLength: 0 })
    })
    it('HostLevelsCondition', () => {
      const condition: Condition = { conditionType: 'HostLevelsCondition', minValue: 4, maxValue: 7 }
      expect(roundtrip(condition, 'HostLevels: 4~7')).toEqual(condition)
    })
    it('HostLevels out-of-range fallback', () => {
      expect(Conditions.fromStr('HostLevels: A~-1')).toEqual({ conditionType: 'HostLevelsCondition', minValue: 1, maxValue: 1 })
      expect(Conditions.fromStr('HostLevels: nonsense')).toEqual({ conditionType: 'HostLevelsCondition', minValue: 1, maxValue: 1 })
    })
    it('WeekdayCondition', () => {
      const condition: Condition = { conditionType: 'WeekdayCondition', startDay: 3, endDay: 6 }
      expect(roundtrip(condition, 'Weekday: 3~6')).toEqual(condition)
    })
    it('Weekday out-of-range fallback', () => {
      expect(Conditions.fromStr('Weekday: -1~100')).toEqual({ conditionType: 'WeekdayCondition', startDay: 0, endDay: 0 })
      expect(Conditions.fromStr('Weekday: nonsense')).toEqual({ conditionType: 'WeekdayCondition', startDay: 0, endDay: 0 })
    })
    it('Weekday with days', () => {
      let condition: Condition = { conditionType: 'WeekdayCondition', days: 'SMTWtFs' }
      expect(roundtrip(condition, 'Weekday: SMTWtFs')).toEqual(condition)
      condition = { conditionType: 'WeekdayCondition', days: 'SM-W-Fs' }
      expect(roundtrip(condition, 'Weekday: SM-W-Fs')).toEqual(condition)
    })
    it('TimeCondition', () => {
      const condition: Condition = { conditionType: 'TimeCondition', startHour: 7, endHour: 23 }
      expect(roundtrip(condition, 'Hour: 7~23')).toEqual(condition)
    })
    it('Hour out-of-range fallback', () => {
      expect(Conditions.fromStr('Hour: -1~100')).toEqual({ conditionType: 'TimeCondition', startHour: 0, endHour: 0 })
      expect(Conditions.fromStr('Hour: nonsense')).toEqual({ conditionType: 'TimeCondition', startHour: 0, endHour: 0 })
    })
    it('parses extra spaces', () => {
      expect(Conditions.fromStr('url:    *abcde*   ')).toEqual({ conditionType: 'UrlWildcardCondition', pattern: '*abcde*' })
    })
    it('parses abbreviated types', () => {
      expect(Conditions.fromStr('url: *://*.example.com/*')).toEqual({ conditionType: 'UrlWildcardCondition', pattern: '*://*.example.com/*' })
    })
    it('parses escaped HostWildcard starting with colon', () => {
      expect(Conditions.fromStr(': :bogus:')).toEqual({ conditionType: 'HostWildcardCondition', pattern: ':bogus:' })
    })
  })
})
