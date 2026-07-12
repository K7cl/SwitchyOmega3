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
    },
  },
)
