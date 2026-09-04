import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

// O backend em modo híbrido roda com o gunicorn da própria imagem Docker
// (`config.wsgi`), não o `runserver` do caminho de desenvolvimento sem Docker:
// o e2e quer o mesmo runtime que sobe em produção e no CI. `THROTTLE_LOGIN`
// alto evita que o login repetido de cada spec esbarre no rate limit; limpar
// `ANTHROPIC_API_KEY` tira o botão "Preencher com IA" do cadastro de hóspede,
// que senão apareceria e mudaria o DOM que os specs afirmam.
const BACKEND_COMMAND =
  '[ -f ../.env ] && . ../.env; ' +
  'THROTTLE_LOGIN=1000/min ANTHROPIC_API_KEY= ' +
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
      // O proxy `/api` do Vite é quem realmente fala com o backend: a espera
      // por esta rota (e não só pela raiz) garante que os dois já sobem.
      url: 'http://127.0.0.1:5173/api/health/',
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
  ],
})
