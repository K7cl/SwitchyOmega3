// build-styles — compile the SwitchyOmega LESS (GPL, from extension/styles)
// into importable CSS under extension/src/styles. Bootstrap 3 (MIT) is imported
// directly from node_modules in the entry files (Vite bundles it and resolves
// the glyphicon font URLs), so it is not vendored here.
//
// Run: node scripts/build-styles.mjs  (outputs are git-ignored, regenerated).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import less from 'less'

const STYLES_SRC = 'extension/styles'
const OUT = 'extension/src/styles'

mkdirSync(OUT, { recursive: true })
for (const name of ['options', 'popup']) {
  const src = readFileSync(`${STYLES_SRC}/${name}.less`, 'utf8')
  const out = await less.render(src, { paths: [STYLES_SRC], filename: `${name}.less` })
  writeFileSync(`${OUT}/${name}.css`, out.css)
  console.log(`  compiled ${name}.less -> src/styles/${name}.css`)
}
console.log('build-styles done.')
