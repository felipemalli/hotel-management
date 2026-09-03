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
      thresholds: { lines: 90, statements: 90, functions: 80, branches: 90 },
    },
  },
})
