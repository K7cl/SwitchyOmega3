import { defineConfig } from 'vitest/config'

// Root test config. Individual packages contribute *.test.ts / *.spec.ts files.
// omega-pac's ported PAC suite (Phase 1) will run here as the behavioral contract.
export default defineConfig({
  test: {
    include: ['packages/**/*.{test,spec}.ts', 'extension/**/*.{test,spec}.ts'],
    environment: 'node',
  },
})
