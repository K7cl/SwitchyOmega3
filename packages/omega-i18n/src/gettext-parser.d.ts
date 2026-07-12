// Minimal type shim for gettext-parser (no bundled types / @types needed).
declare module 'gettext-parser' {
  interface GetTextTranslation {
    msgid: string
    msgstr: string[]
    msgctxt?: string
    comments?: Record<string, string>
  }
  interface GetTextTranslations {
    charset?: string
    headers?: Record<string, string>
    translations: Record<string, Record<string, GetTextTranslation>>
  }
  interface PoParser {
    parse(input: Buffer | string): GetTextTranslations
  }
  const gettextParser: { po: PoParser }
  export const po: PoParser
  export default gettextParser
}
