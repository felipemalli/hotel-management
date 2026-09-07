import js from '@eslint/js'
import prettier from 'eslint-config-prettier/flat'
import jestDom from 'eslint-plugin-jest-dom'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import testingLibrary from 'eslint-plugin-testing-library'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Testes ficam de fora destas regras: montam a árvore real e compartilham fixtures.
const layer = (name, groups) => ({
  message: `A camada ${name} nao importa desta pasta (veja as camadas no GUIA).`,
  group: groups.flatMap((prefix) => [prefix, `${prefix}/**`]),
})

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'node_modules', 'playwright-report', 'test-results', 'e2e/.auth'],
  },

  {
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      react.configs.flat.recommended,
      react.configs.flat['jsx-runtime'],
      reactHooks.configs['recommended-latest'],
      jsxA11y.flatConfigs.recommended,
    ],
    settings: { react: { version: 'detect' } },
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      // `onClick={() => setOpen(true)}` e a forma idiomatica de um handler.
      '@typescript-eslint/no-confusing-void-expression': 'off',
      // Um `onSubmit` assincrono e legitimo: o React ignora o retorno.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },

  {
    files: ['**/*.tsx'],
    extends: [reactRefresh.configs.vite],
  },

  {
    // shadcn/Base UI: variants CVA exportadas ao lado do componente.
    files: ['src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  {
    files: ['src/lib/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [layer('lib', ['@/app', '@/pages', '@/components', '@/features'])] },
      ],
    },
  },

  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [layer('components', ['@/app', '@/pages', '@/features'])] },
      ],
    },
  },

  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            layer('features', ['@/app', '@/pages']),
            {
              message: 'Cruzar pasta de topo e sempre pelo alias `@/`, nunca por `../../`.',
              group: ['../../*'],
            },
          ],
        },
      ],
    },
  },

  {
    files: ['src/pages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            layer('pages', ['@/app']),
            {
              message: 'Cruzar pasta de topo e sempre pelo alias `@/`, nunca por `../../`.',
              group: ['../../*'],
            },
          ],
        },
      ],
    },
  },

  {
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    extends: [testingLibrary.configs['flat/react'], jestDom.configs['flat/recommended']],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  {
    files: ['**/*.js'],
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    languageOptions: { globals: globals.node },
    rules: { 'no-restricted-imports': 'off' },
  },

  prettier,
)
