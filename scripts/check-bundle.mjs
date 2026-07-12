// check-bundle — CI security/integrity gate over the built extension.
// Fails if: the bundle contains eval/new Function, or the emitted manifest
// drifts from the intended MV3 shape (permissions, CSP, background).

import { readFileSync, readdirSync, statSync } from 'node:fs'

const DIST = 'extension/dist'

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = `${dir}/${entry}`
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

const errors = []

// 1. No eval / new Function in shipped JS (CSP would block it anyway).
const evalRe = /\beval\s*\(|\bnew\s+Function\s*\(/
for (const file of walk(DIST)) {
  if (!file.endsWith('.js')) continue
  const src = readFileSync(file, 'utf8')
  if (evalRe.test(src)) errors.push(`eval/new Function found in ${file}`)
}

// 2. Manifest invariants.
const manifest = JSON.parse(readFileSync(`${DIST}/manifest.json`, 'utf8'))
if (manifest.manifest_version !== 3) errors.push('manifest_version is not 3')

const csp = manifest.content_security_policy?.extension_pages ?? ''
if (!csp.includes("script-src 'self'")) errors.push("CSP missing script-src 'self'")
if (csp.includes('unsafe-eval') || csp.includes('unsafe-inline')) {
  errors.push('CSP allows unsafe-eval/unsafe-inline')
}

if (manifest.background?.service_worker == null || manifest.background?.type !== 'module') {
  errors.push('background is not a module service worker')
}

const EXPECTED_PERMISSIONS = [
  'proxy', 'storage', 'unlimitedStorage', 'alarms', 'tabs', 'contextMenus',
  'webRequest', 'webRequestAuthProvider', 'offscreen',
]
const perms = [...(manifest.permissions ?? [])].sort()
const expected = [...EXPECTED_PERMISSIONS].sort()
if (JSON.stringify(perms) !== JSON.stringify(expected)) {
  errors.push(`permissions drift: got ${JSON.stringify(perms)}, expected ${JSON.stringify(expected)}`)
}
const hosts = manifest.host_permissions ?? []
if (JSON.stringify(hosts) !== JSON.stringify(['<all_urls>'])) {
  errors.push(`host_permissions drift: got ${JSON.stringify(hosts)}`)
}

if (errors.length) {
  console.error('check-bundle FAILED:')
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}
console.log('check-bundle OK: no eval, manifest MV3 invariants hold.')
