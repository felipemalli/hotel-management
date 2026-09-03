import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Proxy /api -> backend elimina CORS: no browser tudo e mesma origem (SPEC 2.4).
// Dentro do compose o alvo e http://backend:8000; nativamente, localhost:8000.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000'

// Alias `@/` -> `src/`: o tsconfig ja o declara em `paths`, e a SPEC 6.2
// escreve os mocks como `vi.mock('@/features/*/api')` -- logo o bundler e o
// vitest precisam resolver o mesmo prefixo que o tsc.
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
      ],
      thresholds: { lines: 85, statements: 85, functions: 70, branches: 85 },
    },
  },
})
