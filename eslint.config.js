import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'

// Flat config (ESLint 10). Scoped to the NEW source tree only; the legacy
// CoffeeScript/AngularJS packages are ignored until they are removed post-port.
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.min.js',
      '**/public/**',
      'docs/**',
      // legacy packages (kept as porting reference, not linted)
      'omega-pac/**',
      'omega-target/**',
      'omega-target-chromium-extension/**',
      'omega-web/**',
      'omega-build/**',
      'omega-locales/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      // View/page components use single-word names by design.
      'vue/multi-word-component-names': 'off',
      // Editors intentionally mutate object props that are references into the
      // pinia store (the store is the source of truth). shallowOnly still flags
      // reassigning the prop itself.
      'vue/no-mutating-props': ['error', { shallowOnly: true }],
    },
  },
  {
    // Service worker + node build scripts use console intentionally.
    // Extension code runs in browser + WebExtension contexts; build scripts in node.
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
      // Allow `let` for variables read (in a closure) before their assignment.
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
      // Honor the leading-underscore convention for intentionally-unused args.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Behavioral PAC tests eval() the generated script in the runner only
    // (never in shipped code) — this is the plan's acceptance contract.
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'no-eval': 'off',
    },
  },
)
