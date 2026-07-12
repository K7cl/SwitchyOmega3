// build-locales — converts gettext .po files (locales/) into Chrome
// extension `_locales/<lang>/messages.json` bundles.
//
// Phase 0: stub. Phase 7 implements the full converter (all 28 locales, fixing
// the legacy pipeline's 6-locale limit) using `gettext-parser`. For now the
// extension ships a hand-authored minimal `_locales/en/messages.json` so the
// manifest's `__MSG_*__` references resolve on first load.
//
// See docs/mv3-rewrite-plan.md §3 (omega-locales) and Phase 7.

export {}

console.error(
  'build-locales is not implemented until Phase 7. ' +
    'The extension currently ships a hand-authored _locales/en bundle.',
)
process.exitCode = 1
