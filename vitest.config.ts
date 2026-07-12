import { defineConfig } from 'vitest/config'

// The ported omega-pac Weekday/Time specs are timezone-sensitive; the legacy
// suite ran under TZ=Europe/London. Set it before workers fork (they inherit).
process.env.TZ = 'Europe/London'

// Root test config. Individual packages contribute *.test.ts / *.spec.ts files.
// omega-pac's ported PAC suite (Phase 1) runs here as the behavioral contract.
export default defineConfig({
  test: {
    include: ['packages/**/*.{test,spec}.ts', 'extension/**/*.{test,spec}.ts'],
    environment: 'node',
  },
})
