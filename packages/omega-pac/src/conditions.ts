// conditions — condition model: matching (interpreted) + compilation (to PAC
// boolean expressions) + string encode/decode. Ported from the legacy
// CoffeeScript omega-pac/src/conditions.coffee.
//
// Swaps vs legacy: uglify-js AST -> ./pac_ast; ip-address@4 -> ./ip; Node `url`
// -> WHATWG URL. The dead `regexSafe` reference (only reachable when regTest is
// given a string, which never happens) is fixed to `safeRegex`.

import * as A from './pac_ast.js'
import * as Ip from './ip.js'
import { shExp2RegExp, escapeSlash } from './shexp_utils.js'
import { AttachedCache } from './utils.js'

export interface OmegaRequest {
  url: string
  host: string
  scheme: string
}

export interface Condition {
  conditionType: string
  pattern?: string
  ip?: string
  prefixLength?: number
  minValue?: number
  maxValue?: number
  days?: string
  startDay?: number
  endDay?: number
  startHour?: number
  endHour?: number
  port?: string
  [key: string]: unknown
}

interface ConditionCache {
  analyzed: unknown
  compiled?: A.Node
}

interface BypassCache {
  host: RegExp | '<local>' | null
  ip: Condition | null
  scheme: string | null
  url: RegExp | null
  normalizedPattern: string
  port?: string
}

interface IpCache {
  addr: Ip.IpAddress
  normalized: string
  mask: string
}

interface Handler {
  abbrs: string[]
  analyze(condition: Condition): unknown
  match(condition: Condition, request: OmegaRequest, cache: ConditionCache): boolean
  compile(condition: Condition, cache: ConditionCache): A.Node
  str?(condition: Condition): string
  fromStr?(str: string, condition: Condition): Condition | null
  tag?(condition: Condition): string
  includable?: boolean
}

const ipv6Max = Ip.parse('::/0')!.endAddress().canonicalForm()

let abbrCache: Record<string, string> | null = null

export const Conditions = {
  requestFromUrl(url: string | URL): OmegaRequest {
    const u = typeof url === 'string' ? new URL(url) : url
    return {
      url: u.href,
      // Match Node's legacy url.parse (and Chrome's PAC engine): host without
      // the surrounding brackets for IPv6 literals.
      host: u.hostname.replace(/^\[|\]$/g, ''),
      scheme: u.protocol.replace(':', ''),
    }
  },

  urlWildcard2HostWildcard(pattern: string): string | undefined {
    const result = pattern.match(/^\*:\/\/((?:\w|[?*._-])+)\/\*$/)
    return result?.[1]
  },

  tag(condition: Condition): unknown {
    return condCache.getTag(condition)
  },

  analyze(condition: Condition): ConditionCache {
    return condCache.get(condition, () => ({
      analyzed: Conditions._handler(condition.conditionType).analyze(condition),
    }))
  },

  match(condition: Condition, request: OmegaRequest): boolean {
    const cache = Conditions.analyze(condition)
    return Conditions._handler(condition.conditionType).match(condition, request, cache)
  },

  compile(condition: Condition): A.Node {
    const cache = Conditions.analyze(condition)
    if (cache.compiled) return cache.compiled
    const handler = Conditions._handler(condition.conditionType)
    cache.compiled = handler.compile(condition, cache)
    return cache.compiled
  },

  str(condition: Condition, { abbr }: { abbr: number | string } = { abbr: -1 }): string {
    const handler = Conditions._handler(condition.conditionType)
    if (handler.abbrs[0].length === 0) {
      const pattern = condition.pattern ?? ''
      const endCode = pattern.charCodeAt(pattern.length - 1)
      if (endCode !== Conditions.colonCharCode && pattern.indexOf(' ') < 0) {
        return pattern
      }
    }
    const strFn = handler.str
    const typeStr =
      typeof abbr === 'number'
        ? handler.abbrs[(handler.abbrs.length + abbr) % handler.abbrs.length]
        : condition.conditionType
    let result = typeStr + ':'
    const part = strFn ? strFn.call(Conditions, condition) : condition.pattern
    if (part) result += ' ' + part
    return result
  },

  colonCharCode: ':'.charCodeAt(0),

  fromStr(str: string): Condition | null {
    str = str.trim()
    let i = str.indexOf(' ')
    if (i < 0) i = str.length
    let conditionType: string
    if (str.charCodeAt(i - 1) === Conditions.colonCharCode) {
      conditionType = str.substr(0, i - 1)
      str = str.substr(i + 1).trim()
    } else {
      conditionType = ''
    }

    const resolvedType = Conditions.typeFromAbbr(conditionType)
    if (!resolvedType) return null
    const condition: Condition = { conditionType: resolvedType }
    const fromStr = Conditions._handler(condition.conditionType).fromStr
    if (fromStr) {
      return fromStr.call(Conditions, str, condition)
    }
    condition.pattern = str
    return condition
  },

  typeFromAbbr(abbr: string): string | undefined {
    if (!abbrCache) {
      abbrCache = {}
      for (const type of Object.keys(conditionTypes)) {
        const handler = conditionTypes[type]
        abbrCache[type.toUpperCase()] = type
        for (const ab of handler.abbrs) {
          abbrCache[ab.toUpperCase()] = type
        }
      }
    }
    return abbrCache[abbr.toUpperCase()]
  },

  comment(commentText: string | undefined, node: A.Node): A.Node {
    if (!commentText) return node
    node.commentBefore = commentText
    return node
  },

  safeRegex(expr: string): RegExp {
    try {
      return new RegExp(expr)
    } catch {
      // Invalid regexp! Fall back to one that never matches.
      return /(?!)/
    }
  },

  regTest(expr: string | A.Node, regexp: RegExp | string): A.Node {
    let re: RegExp
    if (typeof regexp === 'string') {
      // Dead branch in practice (analyze always yields a RegExp). Kept for
      // fidelity; the legacy `regexSafe` typo is fixed to `safeRegex`.
      re = Conditions.safeRegex(escapeSlash(regexp))
    } else {
      re = regexp
    }
    const target: A.Node = typeof expr === 'string' ? new A.SymbolRef({ name: expr }) : expr
    return new A.Call({
      args: [target],
      expression: new A.Dot({ property: 'test', expression: new A.RegExpLit({ value: re }) }),
    })
  },

  isInt(num: number): boolean {
    return typeof num === 'number' && !isNaN(num) && parseFloat(String(num)) === parseInt(String(num), 10)
  },

  between(val: A.Node, min: number, max: number, comment?: string): A.Node {
    if (min === max) {
      return Conditions.comment(
        comment,
        new A.Binary({ left: val, operator: '===', right: new A.Num({ value: min }) }),
      )
    }
    if (min > max) {
      return Conditions.comment(comment, new A.False())
    }
    if (Conditions.isInt(min) && Conditions.isInt(max) && max - min < 32) {
      comment ||= `${min} <= value && value <= ${max}`
      const tmpl = '0123456789abcdefghijklmnopqrstuvwxyz'
      const str = max < tmpl.length ? tmpl.substr(min, max - min + 1) : tmpl.substr(0, max - min + 1)
      const pos: A.Node =
        min === 0
          ? val
          : new A.Binary({ left: val, operator: '-', right: new A.Num({ value: min }) })
      return Conditions.comment(
        comment,
        new A.Binary({
          left: new A.Call({
            expression: new A.Dot({ expression: new A.Str({ value: str }), property: 'charCodeAt' }),
            args: [pos],
          }),
          operator: '>',
          right: new A.Num({ value: 0 }),
        }),
      )
    }
    return Conditions.comment(
      comment,
      new A.Call({
        args: [val, new A.Num({ value: min }), new A.Num({ value: max })],
        expression: new A.FunctionExpr({
          argnames: [
            new A.SymbolFunarg({ name: 'value' }),
            new A.SymbolFunarg({ name: 'min' }),
            new A.SymbolFunarg({ name: 'max' }),
          ],
          body: [
            new A.Return({
              value: new A.Binary({
                left: new A.Binary({
                  left: new A.SymbolRef({ name: 'min' }),
                  operator: '<=',
                  right: new A.SymbolRef({ name: 'value' }),
                }),
                operator: '&&',
                right: new A.Binary({
                  left: new A.SymbolRef({ name: 'value' }),
                  operator: '<=',
                  right: new A.SymbolRef({ name: 'max' }),
                }),
              }),
            }),
          ],
        }),
      }),
    )
  },

  parseIp(ip: string): Ip.IpAddress | null {
    if (ip.charCodeAt(0) === 0x5b /* [ */) ip = ip.substr(1, ip.length - 2)
    return Ip.parse(ip)
  },

  normalizeIp(addr: Ip.IpAddress): string {
    return addr.correctForm()
  },

  localHosts: ['127.0.0.1', '[::1]', 'localhost'],

  getWeekdayList(condition: Condition): boolean[] {
    if (condition.days) {
      const days = condition.days
      return Array.from({ length: 7 }, (_, i) => days.charCodeAt(i) > 64)
    }
    const startDay = condition.startDay ?? 0
    const endDay = condition.endDay ?? 0
    return Array.from({ length: 7 }, (_, i) => startDay <= i && i <= endDay)
  },

  _handler(conditionType: string | Condition): Handler {
    const type = typeof conditionType !== 'string' ? conditionType.conditionType : conditionType
    const handler = conditionTypes[type]
    if (!handler) throw new Error(`Unknown condition type: ${type}`)
    return handler
  },

  get _conditionTypes(): Record<string, Handler> {
    return conditionTypes
  },
}

const condCache = new AttachedCache<Condition, ConditionCache>((condition: Condition) => {
  const handler = Conditions._handler(condition.conditionType)
  const result = handler.tag ? handler.tag.call(Conditions, condition) : Conditions.str(condition)
  return condition.conditionType + '$' + result
})

// coffeelint: the handler functions were `.call`-ed with `this` = the module;
// here they reference the `Conditions` object directly via closure.
const conditionTypes: Record<string, Handler> = {
  TrueCondition: {
    abbrs: ['True'],
    analyze: () => null,
    match: () => true,
    compile: () => new A.True(),
    str: () => '',
    fromStr: (_str, condition) => condition,
  },

  FalseCondition: {
    abbrs: ['False', 'Disabled'],
    analyze: () => null,
    match: () => false,
    compile: () => new A.False(),
    fromStr: (str, condition) => {
      if (str.length > 0) condition.pattern = str
      return condition
    },
  },

  UrlRegexCondition: {
    abbrs: ['UR', 'URegex', 'UrlR', 'UrlRegex'],
    analyze: (condition) => Conditions.safeRegex(escapeSlash(condition.pattern ?? '')),
    match: (_condition, request, cache) => (cache.analyzed as RegExp).test(request.url),
    compile: (_condition, cache) => Conditions.regTest('url', cache.analyzed as RegExp),
  },

  UrlWildcardCondition: {
    abbrs: ['U', 'UW', 'Url', 'UrlW', 'UWild', 'UWildcard', 'UrlWild', 'UrlWildcard'],
    analyze: (condition) => {
      const parts = (condition.pattern ?? '')
        .split('|')
        .filter((p) => p)
        .map((pattern) => shExp2RegExp(pattern, { trimAsterisk: true }))
      return Conditions.safeRegex(parts.join('|'))
    },
    match: (_condition, request, cache) => (cache.analyzed as RegExp).test(request.url),
    compile: (_condition, cache) => Conditions.regTest('url', cache.analyzed as RegExp),
  },

  HostRegexCondition: {
    abbrs: ['R', 'HR', 'Regex', 'HostR', 'HRegex', 'HostRegex'],
    analyze: (condition) => Conditions.safeRegex(escapeSlash(condition.pattern ?? '')),
    match: (_condition, request, cache) => (cache.analyzed as RegExp).test(request.host),
    compile: (_condition, cache) => Conditions.regTest('host', cache.analyzed as RegExp),
  },

  HostWildcardCondition: {
    abbrs: [
      '', 'H', 'W', 'HW', 'Wild', 'Wildcard', 'Host', 'HostW', 'HWild', 'HWildcard', 'HostWild',
      'HostWildcard',
    ],
    analyze: (condition) => {
      const parts = (condition.pattern ?? '')
        .split('|')
        .filter((p) => p)
        .map((pattern) => {
          // See the wiki "Host-wildcard-condition" for the magic behavior.
          if (pattern.charCodeAt(0) === '.'.charCodeAt(0)) pattern = '*' + pattern
          if (pattern.indexOf('**.') === 0) {
            return shExp2RegExp(pattern.substring(1), { trimAsterisk: true })
          } else if (pattern.indexOf('*.') === 0) {
            return shExp2RegExp(pattern.substring(2), { trimAsterisk: false })
              .replace(/./, '(?:^|\\.)')
              .replace(/\.\*\$$/, '')
          }
          return shExp2RegExp(pattern, { trimAsterisk: true })
        })
      return Conditions.safeRegex(parts.join('|'))
    },
    match: (_condition, request, cache) => (cache.analyzed as RegExp).test(request.host),
    compile: (_condition, cache) => Conditions.regTest('host', cache.analyzed as RegExp),
  },

  BypassCondition: {
    abbrs: ['B', 'Bypass'],
    analyze: (condition) => {
      // See https://developer.chrome.com/docs/extensions/reference/proxy/
      const cache: BypassCache = {
        host: null,
        ip: null,
        scheme: null,
        url: null,
        normalizedPattern: '',
      }
      let server = condition.pattern ?? ''
      if (server === '<local>') {
        cache.host = '<local>'
        return cache
      }
      let parts = server.split('://')
      if (parts.length > 1) {
        cache.scheme = parts[0]
        cache.normalizedPattern = cache.scheme + '://'
        server = parts[1]
      }

      parts = server.split('/')
      if (parts.length > 1) {
        const addr = Conditions.parseIp(parts[0])
        const prefixLen = parseInt(parts[1])
        if (addr && !isNaN(prefixLen)) {
          cache.ip = {
            conditionType: 'IpCondition',
            ip: Conditions.normalizeIp(addr),
            prefixLength: prefixLen,
          }
          cache.normalizedPattern += cache.ip.ip + '/' + cache.ip.prefixLength
          return cache
        }
      }
      // The server can be an IP address with or without brackets.
      let serverIp = Conditions.parseIp(server)
      let matchPort: string | undefined
      if (!serverIp) {
        const pos = server.lastIndexOf(':')
        if (pos >= 0) {
          matchPort = server.substring(pos + 1)
          server = server.substring(0, pos)
        }
        serverIp = Conditions.parseIp(server)
      }
      if (serverIp) {
        server = Conditions.normalizeIp(serverIp)
        if (serverIp.v4) {
          cache.normalizedPattern += server
        } else {
          cache.normalizedPattern += '[' + server + ']'
        }
      } else {
        if (server.charCodeAt(0) === '.'.charCodeAt(0)) server = '*' + server
        cache.normalizedPattern = server
      }

      if (matchPort) {
        cache.port = matchPort
        cache.normalizedPattern += ':' + cache.port
        // In URL, IPv6 server addresses need to be bracketed.
        if (serverIp && !serverIp.v4) server = '[' + server + ']'
        let serverRegex = shExp2RegExp(server)
        serverRegex = serverRegex.substring(1, serverRegex.length - 1)
        const scheme = cache.scheme ?? '[^:]+'
        cache.url = Conditions.safeRegex(
          '^' + scheme + ':\\/\\/' + serverRegex + ':' + matchPort + '\\/',
        )
      } else if (server !== '*') {
        // In host, IPv6 server addresses are never bracketed.
        const serverRegex = shExp2RegExp(server, { trimAsterisk: true })
        cache.host = Conditions.safeRegex(serverRegex)
      }
      return cache
    },
    match: (_condition, request, cacheWrap) => {
      const cache = cacheWrap.analyzed as BypassCache
      if (cache.scheme != null && cache.scheme !== request.scheme) return false
      if (cache.ip != null && !Conditions.match(cache.ip, request)) return false
      if (cache.host != null) {
        if (cache.host === '<local>') {
          // Align with Chromium: bypass 127.0.0.1, ::1, and any host w/o dots.
          return (
            request.host === '127.0.0.1' ||
            request.host === '::1' ||
            request.host.indexOf('.') < 0
          )
        }
        if (!cache.host.test(request.host)) return false
      }
      if (cache.url != null && !cache.url.test(request.url)) return false
      return true
    },
    str: (condition) => {
      const analyze = Conditions._handler(condition).analyze
      const cache = analyze.call(Conditions, condition) as BypassCache
      return cache.normalizedPattern ? cache.normalizedPattern : (condition.pattern ?? '')
    },
    compile: (_condition, cacheWrap) => {
      const cache = cacheWrap.analyzed as BypassCache
      if (cache.url != null) {
        return Conditions.regTest('url', cache.url)
      }
      const conditions: A.Node[] = []
      if (cache.host === '<local>') {
        const hostEquals = (host: string): A.Node =>
          new A.Binary({
            left: new A.SymbolRef({ name: 'host' }),
            operator: '===',
            right: new A.Str({ value: host }),
          })
        return new A.Binary({
          left: new A.Binary({ left: hostEquals('127.0.0.1'), operator: '||', right: hostEquals('::1') }),
          operator: '||',
          right: new A.Binary({
            left: new A.Call({
              expression: new A.Dot({ expression: new A.SymbolRef({ name: 'host' }), property: 'indexOf' }),
              args: [new A.Str({ value: '.' })],
            }),
            operator: '<',
            right: new A.Num({ value: 0 }),
          }),
        })
      }
      if (cache.scheme != null) {
        conditions.push(
          new A.Binary({
            left: new A.SymbolRef({ name: 'scheme' }),
            operator: '===',
            right: new A.Str({ value: cache.scheme }),
          }),
        )
      }
      if (cache.host != null) {
        conditions.push(Conditions.regTest('host', cache.host))
      } else if (cache.ip != null) {
        conditions.push(Conditions.compile(cache.ip))
      }
      switch (conditions.length) {
        case 0:
          return new A.True()
        case 1:
          return conditions[0]
        default:
          return new A.Binary({ left: conditions[0], operator: '&&', right: conditions[1] })
      }
    },
  },

  KeywordCondition: {
    abbrs: ['K', 'KW', 'Keyword'],
    analyze: () => null,
    match: (condition, request) =>
      request.scheme === 'http' && request.url.indexOf(condition.pattern ?? '') >= 0,
    compile: (condition) =>
      new A.Binary({
        left: new A.Binary({
          left: new A.SymbolRef({ name: 'scheme' }),
          operator: '===',
          right: new A.Str({ value: 'http' }),
        }),
        operator: '&&',
        right: new A.Binary({
          left: new A.Call({
            expression: new A.Dot({ expression: new A.SymbolRef({ name: 'url' }), property: 'indexOf' }),
            args: [new A.Str({ value: condition.pattern ?? '' })],
          }),
          operator: '>=',
          right: new A.Num({ value: 0 }),
        }),
      }),
  },

  IpCondition: {
    abbrs: ['Ip'],
    analyze: (condition): IpCache => {
      let ip = condition.ip ?? ''
      if (ip.charCodeAt(0) === '['.charCodeAt(0)) ip = ip.substr(1, ip.length - 2)
      const addrStr = ip + '/' + condition.prefixLength
      const addr = Conditions.parseIp(addrStr)
      if (!addr) throw new Error(`Invalid IP address ${addrStr}`)
      const normalized = Conditions.normalizeIp(addr)
      const maskSource = addr.v4
        ? Ip.parse('255.255.255.255/' + addr.subnetMask)
        : Ip.parse(ipv6Max + '/' + addr.subnetMask)
      const mask = Conditions.normalizeIp(maskSource!.startAddress())
      return { addr, normalized, mask }
    },
    match: (_condition, request, cacheWrap) => {
      const addr = Conditions.parseIp(request.host)
      if (!addr) return false
      const cache = cacheWrap.analyzed as IpCache
      if (addr.v4 !== cache.addr.v4) return false
      return addr.isInSubnet(cache.addr)
    },
    compile: (_condition, cacheWrap) => {
      const cache = cacheWrap.analyzed as IpCache
      // Make sure host is not a domain name before passing to isInNet, to
      // avoid triggering an expensive DNS lookup.
      const hostLooksLikeIp: A.Node = cache.addr.v4
        ? new A.Binary({
            left: new A.Sub({
              expression: new A.SymbolRef({ name: 'host' }),
              property: new A.Binary({
                left: new A.Dot({ expression: new A.SymbolRef({ name: 'host' }), property: 'length' }),
                operator: '-',
                right: new A.Num({ value: 1 }),
              }),
            }),
            operator: '>=',
            right: new A.Num({ value: 0 }),
          })
        : new A.Binary({
            left: new A.Call({
              expression: new A.Dot({ expression: new A.SymbolRef({ name: 'host' }), property: 'indexOf' }),
              args: [new A.Str({ value: ':' })],
            }),
            operator: '>=',
            right: new A.Num({ value: 0 }),
          })
      if (cache.addr.subnetMask === 0) {
        // 0.0.0.0/0 or ::/0 — match any IP literal via hostLooksLikeIp.
        return hostLooksLikeIp
      }
      let hostIsInNet: A.Node = new A.Call({
        expression: new A.SymbolRef({ name: 'isInNet' }),
        args: [
          new A.SymbolRef({ name: 'host' }),
          new A.Str({ value: cache.normalized }),
          new A.Str({ value: cache.mask }),
        ],
      })
      if (!cache.addr.v4) {
        const hostIsInNetEx = new A.Call({
          expression: new A.SymbolRef({ name: 'isInNetEx' }),
          args: [
            new A.SymbolRef({ name: 'host' }),
            new A.Str({ value: cache.normalized + cache.addr.subnet }),
          ],
        })
        hostIsInNet = new A.Conditional({
          condition: new A.Binary({
            left: new A.UnaryPrefix({ operator: 'typeof', expression: new A.SymbolRef({ name: 'isInNetEx' }) }),
            operator: '===',
            right: new A.Str({ value: 'function' }),
          }),
          consequent: hostIsInNetEx,
          alternative: hostIsInNet,
        })
      }
      return new A.Binary({ left: hostLooksLikeIp, operator: '&&', right: hostIsInNet })
    },
    str: (condition) => condition.ip + '/' + condition.prefixLength,
    fromStr: (str, condition) => {
      const addr = Conditions.parseIp(str)
      if (addr) {
        condition.ip = addr.addressMinusSuffix
        condition.prefixLength = addr.subnetMask
      } else {
        condition.ip = '0.0.0.0'
        condition.prefixLength = 0
      }
      return condition
    },
  },

  HostLevelsCondition: {
    abbrs: [
      'Lv', 'Level', 'Levels', 'HL', 'HLv', 'HLevel', 'HLevels', 'HostL', 'HostLv', 'HostLevel',
      'HostLevels',
    ],
    analyze: () => '.'.charCodeAt(0),
    match: (condition, request, cacheWrap) => {
      const dotCharCode = cacheWrap.analyzed as number
      let dotCount = 0
      const maxValue = condition.maxValue ?? 0
      for (let i = 0; i < request.host.length; i++) {
        if (request.host.charCodeAt(i) === dotCharCode) {
          dotCount++
          if (dotCount > maxValue) return false
        }
      }
      return dotCount >= (condition.minValue ?? 0)
    },
    compile: (condition) => {
      const val = new A.Dot({
        property: 'length',
        expression: new A.Call({
          args: [new A.Str({ value: '.' })],
          expression: new A.Dot({ expression: new A.SymbolRef({ name: 'host' }), property: 'split' }),
        }),
      })
      const minValue = condition.minValue ?? 0
      const maxValue = condition.maxValue ?? 0
      return Conditions.between(val, minValue + 1, maxValue + 1, `${minValue} <= hostLevels <= ${maxValue}`)
    },
    str: (condition) => condition.minValue + '~' + condition.maxValue,
    fromStr: (str, condition) => {
      const [minValue, maxValue] = str.split('~')
      condition.minValue = parseInt(minValue, 10)
      condition.maxValue = parseInt(maxValue, 10)
      if (!(condition.minValue > 0)) condition.minValue = 1
      if (!(condition.maxValue > 0)) condition.maxValue = 1
      return condition
    },
  },

  WeekdayCondition: {
    abbrs: ['WD', 'Week', 'Day', 'Weekday'],
    analyze: () => null,
    match: (condition, _request) => {
      const day = new Date().getDay()
      if (condition.days) return condition.days.charCodeAt(day) > 64
      return (condition.startDay ?? 0) <= day && day <= (condition.endDay ?? 0)
    },
    compile: (condition) => {
      const getDay = new A.Call({
        args: [],
        expression: new A.Dot({
          property: 'getDay',
          expression: new A.New({ args: [], expression: new A.SymbolRef({ name: 'Date' }) }),
        }),
      })
      if (condition.days) {
        return new A.Binary({
          left: new A.Call({
            expression: new A.Dot({ expression: new A.Str({ value: condition.days }), property: 'charCodeAt' }),
            args: [getDay],
          }),
          operator: '>',
          right: new A.Num({ value: 64 }),
        })
      }
      return Conditions.between(getDay, condition.startDay ?? 0, condition.endDay ?? 0)
    },
    str: (condition) =>
      condition.days ? condition.days : condition.startDay + '~' + condition.endDay,
    fromStr: (str, condition) => {
      if (str.indexOf('~') < 0 && str.length === 7) {
        condition.days = str
      } else {
        const [startDay, endDay] = str.split('~')
        condition.startDay = parseInt(startDay, 10)
        condition.endDay = parseInt(endDay, 10)
        if (!(condition.startDay >= 0 && condition.startDay <= 6)) condition.startDay = 0
        if (!(condition.endDay >= 0 && condition.endDay <= 6)) condition.endDay = 0
      }
      return condition
    },
  },

  TimeCondition: {
    abbrs: ['T', 'Time', 'Hour'],
    analyze: () => null,
    match: (condition, _request) => {
      const hour = new Date().getHours()
      return (condition.startHour ?? 0) <= hour && hour <= (condition.endHour ?? 0)
    },
    compile: (condition) => {
      const val = new A.Call({
        args: [],
        expression: new A.Dot({
          property: 'getHours',
          expression: new A.New({ args: [], expression: new A.SymbolRef({ name: 'Date' }) }),
        }),
      })
      return Conditions.between(val, condition.startHour ?? 0, condition.endHour ?? 0)
    },
    str: (condition) => condition.startHour + '~' + condition.endHour,
    fromStr: (str, condition) => {
      const [startHour, endHour] = str.split('~')
      condition.startHour = parseInt(startHour, 10)
      condition.endHour = parseInt(endHour, 10)
      if (!(condition.startHour >= 0 && condition.startHour < 24)) condition.startHour = 0
      if (!(condition.endHour >= 0 && condition.endHour < 24)) condition.endHour = 0
      return condition
    },
  },
}

export default Conditions
