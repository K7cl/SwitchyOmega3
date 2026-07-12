// build-locales — convert the gettext .po translations into Chrome extension
// `_locales/<lang>/messages.json` bundles for ALL locales (the legacy po2crx
// pipeline wired only 6 of 28).
//
// Placeholder handling mirrors the legacy grunt-po2crx: `$order:NAME$` in a
// message becomes the Chrome named placeholder `$NAME$` plus a placeholders map
// { NAME: { content: "$order" } }. A lone space message means "empty".
//
// Run with Node's built-in TypeScript support: `node src/build_locales.ts`.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import gettextParser from 'gettext-parser'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = join(here, '..', '..', '..')
const SRC = join(REPO, 'omega-locales')
const DEST = join(REPO, 'extension', 'public', '_locales')

// Map omega-locales dir names to Chrome locale codes where they differ.
const REMAP: Record<string, string> = {
  en_US: 'en', // default_locale
  nb_NO: 'nb',
  he_IL: 'he',
  es_AR: 'es_419',
}
// Traditional Chinese is covered by the zh_TW dir; zh_Hant is not a Chrome code.
const SKIP = new Set(['zh_Hant'])

interface ChromeMessage {
  message: string
  placeholders?: Record<string, { content: string }>
}

function transform(raw: string): ChromeMessage {
  const refs: (string | undefined)[] = []
  let matchCount = 0
  const message = raw.replace(/\$(\d+:)?(\w+)\$/g, (_m, order: string | undefined, ref: string) => {
    matchCount++
    const idx = order ? parseInt(order, 10) : matchCount
    refs[idx] = ref
    return '$' + ref + '$'
  })
  const finalMessage = message === ' ' ? '' : message
  if (!matchCount) return { message: finalMessage }
  const placeholders: Record<string, { content: string }> = {}
  for (let i = 0; i < refs.length; i++) {
    const placeholder = refs[i] ?? '_unused_' + i
    placeholders[placeholder] = { content: '$' + i }
  }
  return { message: finalMessage, placeholders }
}

function convertPo(file: string): Record<string, ChromeMessage> {
  const parsed = gettextParser.po.parse(readFileSync(file))
  const ctx = parsed.translations[''] ?? {}
  const out: Record<string, ChromeMessage> = {}
  for (const msgid of Object.keys(ctx)) {
    if (!msgid) continue // header
    const msgstr = ctx[msgid].msgstr?.[0] ?? ''
    if (!msgstr) continue // untranslated → Chrome falls back to the default locale
    out[msgid] = transform(msgstr)
  }
  return out
}

let locales = 0
let totalKeys = 0
for (const dir of readdirSync(SRC)) {
  if (SKIP.has(dir)) continue
  const poFile = join(SRC, dir, 'LC_MESSAGES', 'omega-web.po')
  if (!existsSync(poFile)) continue
  const locale = REMAP[dir] ?? dir
  const messages = convertPo(poFile)
  const count = Object.keys(messages).length
  if (count === 0) continue
  const destDir = join(DEST, locale)
  mkdirSync(destDir, { recursive: true })
  writeFileSync(join(destDir, 'messages.json'), JSON.stringify(messages, null, 2) + '\n')
  locales++
  totalKeys += count
  console.log(`  ${dir} -> _locales/${locale} (${count} messages)`)
}
console.log(`Converted ${locales} locales, ${totalKeys} messages total.`)
