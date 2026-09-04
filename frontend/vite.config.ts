import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000'

// O alias `@/` também é declarado em `paths` do tsconfig: os testes escrevem
// `vi.mock('@/features/*/api')`, logo bundler, vitest e tsc precisam resolver o
// mesmo prefixo para o mesmo diretório.
const srcDir = fileURLToPath(new URL('./src', import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': srcDir },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    // Pinned to src: the default include (`**/*.{test,spec}.*`) would collect e2e/*.spec.ts,
    // which import @playwright/test and cannot run under vitest.
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    mockReset: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/**/__fixtures__/**',
        'src/main.tsx',
        'src/**/types.ts',
        // shadcn/Base UI vendored primitives: behaviour proved by consumers, not here.
        'src/components/ui/**',
        // The only mocked seam of the suite; exercised end to end by Playwright.
        'src/features/**/api.ts',
        // Barrels and pure-markup skeletons have no branches worth a threshold.
        'src/**/index.ts',
        'src/**/*Skeleton.tsx',
      ],
      thresholds: {
        // Global floor: an alarm against gross regression, not a target. What proves
        // RF/RN coverage is traceability (normative test ids + the RF/RN matrix), not this number.
        lines: 80,
        // Mirror of "pricing.py 100% branches" on the backend: money/date/normalization
        // contracts are fully pinned. Double-star so the glob survives the lib/ regroup.
        'src/lib/**/money.ts': { 100: true },
        'src/lib/**/dates.ts': { 100: true },
        'src/lib/**/normalize.ts': { 100: true },
        'src/features/*/schemas.ts': { lines: 95, branches: 90 },
      },
    },
  },
})
