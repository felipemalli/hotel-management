# Qualidade: testes, cobertura e ferramental

Os comandos das suítes estão no [README](../../README.md). A matriz que liga
cada requisito ao teste que o prova está em [CHALLENGE.md](../CHALLENGE.md).
Contagem de testes envelhece a cada commit e não vale como prova; a matriz e o
CI valem.

## 1. As suítes

| Suíte              | Onde                                                  | O que prova                                                                                                              |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Backend unitário   | `backend/tests/unit/`                                 | O motor de cálculo (T1–T9, fronteiras 11:59 / 12:00:00 / 12:01, day-use) e a normalização de PII. Sem banco.             |
| Backend banco      | `backend/tests/db/`                                   | Constraints nomeadas, services, selectors e o seed contra PostgreSQL real.                                                |
| Backend API        | `backend/tests/api/`                                  | O contrato HTTP ponta a ponta: envelope de erro, autenticação por cookie, throttle, schema OpenAPI e a Íris com transporte dublado. |
| Frontend unitário  | `src/lib/**/*.test.ts`, `src/features/**/*.test.ts`   | Lógica sem UI: dinheiro, datas, PII, schemas com regra, filtros da URL, histórico e status da reserva, `useAuth`.        |
| Frontend integração| `*.test.tsx` ao lado do componente ou da página       | Página ou componente real com `QueryClient`, roteador e react-hook-form de verdade; o único dublê é `@/features/*/api`.   |
| e2e                | `frontend/e2e/*.spec.ts`                              | O fluxo real no Chromium contra o backend real com o seed: login, recepção, checkout e pagamento, controles do admin.     |

## 2. Doutrina

- **Um único mock no frontend: `@/features/<x>/api` (`vi.mock`).** Nada de mock
  de hook, de axios ou de router. MSW foi cogitado e recusado: dublaria a mesma
  camada uma porta mais abaixo, sem provar nada que o mock de API já não prove,
  pelo custo de manter handlers sincronizados com o contrato.
- **Nenhum teste de frontend refaz aritmética.** Os fixtures de extrato
  (`frontend/src/features/reservations/__fixtures__/bills.ts`) são cópia literal
  de T1–T9, e `backend/tests/unit/test_pricing.py` replica a mesma tabela.
  Divergência entre backend, frontend e tabela quebra a suíte.
- **Nenhum teste toca a rede, e isso é fiscalizado.** Dois fixtures `autouse`
  em `backend/conftest.py` zeram a `OPENAI_API_KEY` e bloqueiam `httpx.post` na
  suíte inteira; um teste novo que esquecesse de dublar o transporte falha alto
  em vez de gastar crédito do provedor.
- **e2e só no Chromium.** O objetivo é provar o contrato ponta a ponta, não a
  compatibilidade entre motores de navegador: nenhuma regra de negócio depende
  de uma API do WebKit.
- **Cobertura é alarme, não meta.** Piso de 85% de linhas no backend
  (`hotel`, `accounts`, `core`, `ai`) e de 80% no frontend, contra regressão
  grosseira. Pinos altos só onde há regra ou contrato: 100% em `money.ts`,
  `dates.ts` e `normalize.ts`; 95% de linhas e 90% de ramos em
  `features/*/schemas.ts`. Percentual não prova requisito; a matriz prova.

## 3. Ferramental do CI

O que está configurado é exatamente o que o CI cobra, para que "passa na minha
máquina" e "passa no CI" signifiquem a mesma coisa.

| Ferramenta                 | Configuração                                        | Papel                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ruff**                   | `backend/pyproject.toml`                            | Lint do Python (`uv run ruff check .` no CI, com as regras `I`/`UP`). A formatação com Ruff fica no editor (`.vscode/settings.json`), não no CI.                       |
| **import-linter**          | `backend/pyproject.toml` (`[tool.importlinter]`)    | Fiscaliza o grafo entre `core`, `accounts`, os quatro apps de `hotel/` e `ai/`. Passo `uv run lint-imports` no CI.                                                     |
| **Guarda de `float(`**     | `.github/workflows/ci.yml`                          | Recusa `float(` em `backend/hotel`, `backend/accounts`, `backend/core` e `backend/ai`; o espelho no frontend recusa `Number(`, `parseFloat` e afins onde há dinheiro.   |
| **Prettier**               | `frontend/.prettierrc`                              | Formatação única (sem `;`, aspas simples, 100 colunas), com `prettier-plugin-tailwindcss` ordenando classes inclusive dentro de `cn()`/`cva()`.                       |
| **ESLint 9** (flat config) | `frontend/eslint.config.js`                         | `typescript-eslint` type-aware (`strictTypeChecked`), `jsx-a11y`, `react-hooks`, `simple-import-sort`, `testing-library`/`jest-dom`, e `no-restricted-imports` impondo as camadas `lib → components → features → pages → app`. `--max-warnings 0`. |
| **TypeScript**             | `frontend/tsconfig{,.app,.test,.node,.e2e}.json`    | Quatro programas por `references`, para que `node`, os globais de teste e o Playwright não tipem código de produção. `strict` + `noUncheckedIndexedAccess`.            |
| **Vitest** + cobertura v8  | `frontend/vite.config.ts`                           | `mockReset`/`restoreMocks` globais e os pisos de cobertura do §2; o CI ainda confere que os arquivos dos pinos existem (pino sem arquivo passaria em silêncio).       |
| **Playwright**             | `frontend/playwright.config.ts`                     | Só Chromium, `workers: 1`; o `webServer` sobe gunicorn e o Vite sozinho.                                                                                               |
| **Guarda de ids**          | `.github/workflows/ci.yml`                          | Os ids normativos da matriz RF/RN precisam existir nos arquivos nomeados; renomear um caso quebra o CI.                                                                |
| **Versões fixadas**        | `frontend/.nvmrc`, `packageManager` no `package.json`, `backend/uv.lock` | Node 24 e o pnpm exato via `corepack`; Python travado pelo `uv`. Uma versão só na imagem, no CI e na máquina.                                        |
| `.editorconfig` e `.vscode/` | raiz do repositório                               | Fim de linha, indentação e format-on-save iguais para quem clonar.                                                                                                     |
