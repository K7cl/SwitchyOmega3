// rule_list — parse/compose AutoProxy and SwitchyOmega rule-list formats.
// Ported from the legacy CoffeeScript omega-pac/src/rule_list.coffee.
//
// Swap: Node `Buffer.from(text, 'base64')` -> `atob` + TextDecoder (available
// in service workers and pages; no Node Buffer needed).

import { Conditions, type Condition } from './conditions.js'

export interface Rule {
  condition: Condition
  profileName: string | null
  source?: string
  note?: string
}

/** Common shape of a rule-list format handler (AutoProxy / Switchy). */
export interface RuleListFormat {
  detect(text: string): boolean | undefined
  parse(text: string, matchProfileName: string, defaultProfileName: string): Rule[]
  preprocess?(text: string): string
  directReferenceSet?(profile: {
    ruleList: string
    matchProfileName?: string
    defaultProfileName?: string
  }): Record<string, string> | undefined
}

function strStartsWith(str: string, prefix: string): boolean {
  return str.substr(0, prefix.length) === prefix
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

interface ParseArgs {
  strict?: boolean
  source?: boolean
}

const AutoProxy = {
  magicPrefix: 'W0F1dG9Qcm94', // base64-encoded "[AutoProxy"
  detect(text: string): boolean | undefined {
    if (strStartsWith(text, AutoProxy.magicPrefix)) return true
    if (strStartsWith(text, '[AutoProxy')) return true
    return undefined
  },
  preprocess(text: string): string {
    if (strStartsWith(text, AutoProxy.magicPrefix)) {
      text = base64ToUtf8(text)
    }
    return text
  },
  parse(text: string, matchProfileName: string, defaultProfileName: string): Rule[] {
    const normalRules: Rule[] = []
    const exclusiveRules: Rule[] = []
    for (let line of text.split(/\n|\r/)) {
      line = line.trim()
      if (line.length === 0 || line[0] === '!' || line[0] === '[') continue
      const source = line
      let profile = matchProfileName
      let list = normalRules
      if (line[0] === '@' && line[1] === '@') {
        profile = defaultProfileName
        list = exclusiveRules
        line = line.substring(2)
      }
      let cond: Condition
      if (line[0] === '/') {
        cond = { conditionType: 'UrlRegexCondition', pattern: line.substring(1, line.length - 1) }
      } else if (line[0] === '|') {
        if (line[1] === '|') {
          cond = { conditionType: 'HostWildcardCondition', pattern: '*.' + line.substring(2) }
        } else {
          cond = { conditionType: 'UrlWildcardCondition', pattern: line.substring(1) + '*' }
        }
      } else if (line.indexOf('*') < 0) {
        cond = { conditionType: 'KeywordCondition', pattern: line }
      } else {
        cond = { conditionType: 'UrlWildcardCondition', pattern: 'http://*' + line + '*' }
      }
      list.push({ condition: cond, profileName: profile, source })
    }
    // Exclusive rules have higher priority, so they come first.
    return exclusiveRules.concat(normalRules)
  },
}

const Switchy = {
  omegaPrefix: '[SwitchyOmega Conditions',
  specialLineStart: '[;#@!',

  detect(text: string): boolean | undefined {
    if (strStartsWith(text, Switchy.omegaPrefix)) return true
    return undefined
  },

  parse(text: string, matchProfileName: string, defaultProfileName: string): Rule[] {
    const parser = Switchy.getParser(text)
    return parser === 'parseOmega'
      ? Switchy.parseOmega(text, matchProfileName, defaultProfileName)
      : Switchy.parseLegacy(text, matchProfileName, defaultProfileName)
  },

  directReferenceSet({
    ruleList,
    matchProfileName: _matchProfileName,
    defaultProfileName,
  }: {
    ruleList: string
    matchProfileName?: string
    defaultProfileName?: string
  }): Record<string, string> | undefined {
    const text = ruleList.trim()
    const parser = Switchy.getParser(text)
    if (parser !== 'parseOmega') return undefined
    if (!/(^|\n)@with\s+results?(\r|\n|$)/i.test(text)) return undefined
    const refs: Record<string, string> = {}
    for (let line of text.split(/\n|\r/)) {
      line = line.trim()
      if (Switchy.specialLineStart.indexOf(line[0]) < 0) {
        const iSpace = line.lastIndexOf(' +')
        let profile: string
        if (iSpace < 0) {
          profile = defaultProfileName || 'direct'
        } else {
          profile = line.substr(iSpace + 2).trim()
        }
        refs['+' + profile] = profile
      }
    }
    return refs
  },

  // https://github.com/FelisCatus/SwitchyOmega/wiki/SwitchyOmega-conditions-format
  compose(
    { rules, defaultProfileName }: { rules: Rule[]; defaultProfileName: string },
    { withResult, useExclusive }: { withResult?: boolean; useExclusive?: boolean } = {},
  ): string {
    const eol = '\r\n'
    let ruleList = '[SwitchyOmega Conditions]' + eol
    useExclusive ??= !withResult
    if (withResult) {
      ruleList += '@with result' + eol + eol
    } else {
      ruleList += eol
    }
    const specialLineStart = Switchy.specialLineStart + '+'
    for (const rule of rules) {
      if (rule.note) ruleList += '@note ' + rule.note + eol
      let line = Conditions.str(rule.condition)
      if (useExclusive && rule.profileName === defaultProfileName) {
        line = '!' + line
      } else {
        if (specialLineStart.indexOf(line[0]) >= 0) line = ': ' + line
        if (withResult) line += ' +' + rule.profileName
      }
      ruleList += line + eol
    }
    if (withResult) {
      ruleList += eol + '* +' + defaultProfileName + eol
    }
    return ruleList
  },

  getParser(text: string): 'parseOmega' | 'parseLegacy' {
    let parser: 'parseOmega' | 'parseLegacy' = 'parseOmega'
    if (!strStartsWith(text, Switchy.omegaPrefix)) {
      if (text[0] === '#' || text.indexOf('\n#') >= 0) parser = 'parseLegacy'
    }
    return parser
  },

  conditionFromLegacyWildcard(pattern: string): Condition {
    if (pattern[0] === '@') {
      pattern = pattern.substring(1)
    } else {
      if (pattern.indexOf('://') <= 0 && pattern[0] !== '*') pattern = '*' + pattern
      if (pattern[pattern.length - 1] !== '*') pattern += '*'
    }
    const host = Conditions.urlWildcard2HostWildcard(pattern)
    if (host) {
      return { conditionType: 'HostWildcardCondition', pattern: host }
    }
    return { conditionType: 'UrlWildcardCondition', pattern }
  },

  parseLegacy(text: string, matchProfileName: string, defaultProfileName: string): Rule[] {
    const normalRules: Rule[] = []
    const exclusiveRules: Rule[] = []
    let begin = false
    let section = 'WILDCARD'
    for (let line of text.split(/\n|\r/)) {
      line = line.trim()
      if (line.length === 0 || line[0] === ';') continue
      if (!begin) {
        if (line.toUpperCase() === '#BEGIN') begin = true
        continue
      }
      if (line.toUpperCase() === '#END') break
      if (line[0] === '[' && line[line.length - 1] === ']') {
        section = line.substring(1, line.length - 1).toUpperCase()
        continue
      }
      const source = line
      let profile = matchProfileName
      let list = normalRules
      if (line[0] === '!') {
        profile = defaultProfileName
        list = exclusiveRules
        line = line.substring(1)
      }
      let cond: Condition | null
      switch (section) {
        case 'WILDCARD':
          cond = Switchy.conditionFromLegacyWildcard(line)
          break
        case 'REGEXP':
          cond = { conditionType: 'UrlRegexCondition', pattern: line }
          break
        default:
          cond = null
      }
      if (cond) list.push({ condition: cond, profileName: profile, source })
    }
    return exclusiveRules.concat(normalRules)
  },

  parseOmega(
    text: string,
    matchProfileName: string,
    defaultProfileName: string,
    args: ParseArgs = {},
  ): Rule[] {
    const { strict } = args
    const error = strict
      ? (fields: { message: string; [k: string]: unknown }) => {
          const err = new Error(fields.message) as Error & Record<string, unknown>
          for (const key of Object.keys(fields)) err[key] = fields[key]
          throw err
        }
      : undefined
    const includeSource = args.source ?? true
    const rules: Rule[] = []
    const rulesWithDefaultProfile: Rule[] = []
    let withResult = false
    let exclusiveProfile: string | null = null
    let noteForNextRule: string | null = null
    let lno = 0
    for (let line of text.split(/\n|\r/)) {
      lno++
      line = line.trim()
      if (line.length === 0) continue
      if (line[0] === '[') continue // Header line
      if (line[0] === ';') continue // Comment line
      if (line[0] === '@') {
        // Directive line
        let iSpace = line.indexOf(' ')
        if (iSpace < 0) iSpace = line.length
        const directive = line.substr(1, iSpace - 1)
        line = line.substr(iSpace + 1).trim()
        switch (directive.toUpperCase()) {
          case 'WITH': {
            const feature = line.toUpperCase()
            if (feature === 'RESULT' || feature === 'RESULTS') withResult = true
            break
          }
          case 'NOTE':
            noteForNextRule = line
            break
        }
        continue
      }

      let source: string | null = null
      if (strict) exclusiveProfile = null
      let profile: string | null
      if (line[0] === '!') {
        profile = withResult ? null : defaultProfileName
        source = line
        line = line.substr(1)
      } else if (withResult) {
        const iSpace = line.lastIndexOf(' +')
        if (iSpace < 0) {
          error?.({
            message: 'Missing result profile name: ' + line,
            reason: 'missingResultProfile',
            source: line,
            sourceLineNo: lno,
          })
          continue
        }
        profile = line.substr(iSpace + 2).trim()
        line = line.substr(0, iSpace).trim()
        if (line === '*') exclusiveProfile = profile
      } else {
        profile = matchProfileName
      }

      const cond = Conditions.fromStr(line)
      if (!cond) {
        error?.({
          message: 'Invalid rule: ' + line,
          reason: 'invalidRule',
          source: source ?? line,
          sourceLineNo: lno,
        })
        continue
      }

      const rule: Rule = {
        condition: cond,
        profileName: profile,
        source: includeSource ? (source ?? line) : undefined,
      }
      if (noteForNextRule != null) {
        rule.note = noteForNextRule
        noteForNextRule = null
      }
      rules.push(rule)
      if (!profile) rulesWithDefaultProfile.push(rule)
    }

    if (withResult) {
      if (!exclusiveProfile) {
        if (strict) {
          error?.({
            message: "Missing default rule with catch-all '*' condition",
            reason: 'noDefaultRule',
          })
        }
        exclusiveProfile = defaultProfileName || 'direct'
      }
      for (const rule of rulesWithDefaultProfile) {
        rule.profileName = exclusiveProfile
      }
    }
    return rules
  },
}

export const RuleList: Record<string, RuleListFormat> = { AutoProxy, Switchy }
export { AutoProxy, Switchy }
