import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000'

// Alias `@/` também em `paths` do tsconfig: bundler, vitest e tsc resolvem o mesmo prefixo.
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
    // Só `src`: o include padrão coletaria e2e/*.spec.ts no vitest.
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
        // Primitivos shadcn/Base UI: comportamento provado pelos consumidores.
        'src/components/ui/**',
        // Única costura dublada da suíte; o e2e exercita o api.ts de ponta a ponta.
        'src/features/**/api.ts',
        // Barrels e esqueletos sem ramo que justifique limiar.
        'src/**/index.ts',
        'src/**/*Skeleton.tsx',
      ],
      thresholds: {
        lines: 80,
        // Dinheiro, data e normalização: 100%, como no backend.
        'src/lib/**/money.ts': { 100: true },
        'src/lib/**/dates.ts': { 100: true },
        'src/lib/**/normalize.ts': { 100: true },
        'src/features/*/schemas.ts': { lines: 95, branches: 90 },
      },
    },
  },
})
