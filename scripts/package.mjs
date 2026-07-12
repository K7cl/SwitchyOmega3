// package — build a Chrome Web Store zip from the built extension.
// Usage: node scripts/package.mjs  (run after the build)

import { readFileSync, mkdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const DIST = 'extension/dist'
const OUT_DIR = 'dist-zip'

const manifest = JSON.parse(readFileSync(`${DIST}/manifest.json`, 'utf8'))
const version = manifest.version ?? '0.0.0'
const zipPath = `${process.cwd()}/${OUT_DIR}/switchyomega3-${version}.zip`

mkdirSync(OUT_DIR, { recursive: true })
rmSync(zipPath, { force: true })

// Zip the CONTENTS of dist (no top-level dir), excluding sourcemaps from the
// store package.
execFileSync('zip', ['-r', '-q', zipPath, '.', '-x', '*.map'], { cwd: DIST, stdio: 'inherit' })

console.log(`Packaged ${zipPath}`)
