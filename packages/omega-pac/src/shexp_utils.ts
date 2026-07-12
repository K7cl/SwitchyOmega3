// shexp_utils — shell-expression (wildcard) → RegExp helpers.
// Ported 1:1 from the legacy CoffeeScript omega-pac/src/shexp_utils.coffee.

/** Regex metacharacters that must be backslash-escaped in a generated regex. */
const regExpMetaChars: ReadonlySet<number> = new Set(
  [...'\\[^$.|?*+(){}/'].map((c) => c.charCodeAt(0)),
)

const CHAR_SLASH = 47 // /
const CHAR_BACKSLASH = 92 // \
const CHAR_ASTERISK = 42 // *
const CHAR_QUESTION = 63 // ?

/** Escape every unescaped forward slash (for embedding in a regex literal). */
export function escapeSlash(pattern: string): string {
  let escaped = false
  let start = 0
  let result = ''
  for (let i = 0; i < pattern.length; i++) {
    const code = pattern.charCodeAt(i)
    if (code === CHAR_SLASH && !escaped) {
      result += pattern.substring(start, i)
      result += '\\'
      start = i
    }
    escaped = code === CHAR_BACKSLASH && !escaped
  }
  return result + pattern.substr(start)
}

export interface ShExpOptions {
  trimAsterisk?: boolean
}

/** Convert a shell-expression pattern (with `*` and `?`) to a regex source string. */
export function shExp2RegExp(pattern: string, options?: ShExpOptions): string {
  const trimAsterisk = options?.trimAsterisk || false
  let start = 0
  let end = pattern.length
  if (trimAsterisk) {
    while (start < end && pattern.charCodeAt(start) === CHAR_ASTERISK) start++
    while (start < end && pattern.charCodeAt(end - 1) === CHAR_ASTERISK) end--
    if (end - start === 1 && pattern.charCodeAt(start) === CHAR_ASTERISK) {
      return ''
    }
  }
  let regex = ''
  if (start === 0) regex += '^'
  for (let i = start; i < end; i++) {
    const code = pattern.charCodeAt(i)
    switch (code) {
      case CHAR_ASTERISK:
        regex += '.*'
        break
      case CHAR_QUESTION:
        regex += '.'
        break
      default:
        if (regExpMetaChars.has(code)) regex += '\\'
        regex += pattern[i]
    }
  }
  if (end === pattern.length) regex += '$'
  return regex
}
