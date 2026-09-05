import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

// Gunicorn (`config.wsgi`), não `runserver`. THROTTLE_LOGIN alto para o login
// repetido; ANTHROPIC_API_KEY vazio tira o botão de IA do cadastro.
const BACKEND_COMMAND =
  '[ -f ../.env ] && . ../.env; ' +
  'THROTTLE_LOGIN=1000/min THROTTLE_REFRESH=1000/min ANTHROPIC_API_KEY= ' +
  'uv run gunicorn config.wsgi -b 127.0.0.1:8000'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'anon',
      testMatch: /login\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      testIgnore: /login\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/atendente.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      command: BACKEND_COMMAND,
      cwd: '../backend',
      url: 'http://127.0.0.1:8000/api/health/',
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm run dev -- --port 5173 --strictPort',
      // Esperar `/api`, não só `/`: o proxy do Vite é quem fala com o backend.
      url: 'http://127.0.0.1:5173/api/health/',
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
  ],
})
