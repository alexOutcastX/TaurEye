import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // supabase/functions are Deno Edge functions (Deno globals, npm: imports) —
  // they aren't part of the Vite app and shouldn't be linted with browser rules.
  globalIgnores(['dist', 'supabase']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // react-hooks v7's set-state-in-effect flags intentional effect-driven
      // state syncs we rely on (loading flags before a fetch, resets on prop
      // change, mount-time data loads). These aren't defects, so keep the rule
      // off until/unless those effects are reworked for the React Compiler.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
