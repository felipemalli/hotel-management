# Qualidade: doutrina de teste, cobertura e ferramental

> Voltar ao [README](../README.md). Os comandos das quatro suítes estão na
> seção 2 do README; a matriz de rastreabilidade RF/RN, na seção 3.

## 1. As três suítes

Três suítes: backend em Pytest (unitários puros do motor financeiro, testes de
banco com PostgreSQL real e testes de API ponta a ponta), frontend em Vitest +
Testing Library, e e2e em Playwright contra o backend real. Os comandos do README §2
são a verdade; contagem de testes envelhece a cada commit e não vale como prova.


`pnpm run check` é `typecheck && lint && format:check && test:coverage && build`.
Os cinco também rodam soltos quando você quer só um (`pnpm run lint`,
`pnpm run test -- --run`, `pnpm run format` para corrigir a formatação em vez de
apenas conferi-la).

Sem a stack de pé, o mesmo pelo caminho híbrido: `cd backend && uv run pytest -q`
(precisa do `db` no ar e das variáveis exportadas, como em [`COMO-RODAR.md`](COMO-RODAR.md) §2).

**O que é "integração" aqui, e por que MSW foi rejeitado.** A maioria dos testes
de frontend monta a página ou o componente real com `QueryClient`, roteador e
RHF de verdade; o único ponto dublado é `@/features/*/api.ts` (`vi.mock`, zero
mock de hook, de axios ou de router). MSW foi cogitado e recusado: ele dublaria
a mesma camada uma porta mais abaixo, sem provar nada que o mock de API já não
prove, pelo custo de manter handlers sincronizados com o contrato. Unitário
puro fica para lógica sem UI (dinheiro, PII, datas, schemas com regra); e2e
fica para o fluxo real contra o backend — só Chromium, porque o objetivo é
provar o contrato ponta a ponta, não compatibilidade entre motores de
navegador (nenhuma regra de negócio depende de um `overflow` ou de uma
API do WebKit). Um project `webkit` funcionaria com `COOKIE_SECURE=0`, o default
da demo; com a flag ligada, o WebKit descarta cookie `Secure` sobre http e o dev
precisaria de TLS.

**Cobertura condicionada ao que importa, não perseguida como meta.** O piso
global é propositalmente baixo (80% de linhas) — é um alarme contra regressão
grosseira, não uma barra a escalar. Pinos altos (95–100%) ficam só onde há
regra ou contrato: `money.ts`, `dates.ts`, `normalize.ts` e os `schemas.ts` de
cada feature. Percentual não prova requisito — a **matriz de rastreabilidade** do README §3
prova, e o CI a guarda com um teste próprio (ela não pode divergir do
código sem que a suíte quebre).

Duas garantias que valem mencionar porque são incomuns:

- **A tabela de casos numéricos é a fonte da verdade, e é replicada 1:1** em
  `backend/tests/unit/test_pricing.py` (9 casos parametrizados, incluindo as
  fronteiras 11:59 / 12:00:00 / 12:01 e o day-use) e em
  `frontend/src/features/reservations/__fixtures__/bills.ts` (render do
  extrato). Divergência entre backend, frontend e tabela quebra a suíte.
- **Nenhum teste toca a rede** — e isso não é convenção, é fiscalizado. Dois
  fixtures `autouse` no `conftest.py` zeram a `OPENAI_API_KEY` e bloqueiam o
  `httpx.post` na suíte inteira, então um teste novo que esquecesse de dublar o
  transporte falha alto em vez de gastar crédito do provedor. A Íris ([`IRIS.md`](IRIS.md))
  é testada com o transporte HTTP dublado: a fila de respostas do teste encena o
  laço de *tool use* rodada por rodada, e o caminho sem chave é exercitado de
  verdade.

---

## 2. Ferramental do CI

O que está configurado — e é exatamente o que o CI cobra, para que "passa na
minha máquina" e "passa no CI" signifiquem a mesma coisa:

| Ferramenta | Configuração | Papel |
|---|---|---|
| **Ruff** | `backend/pyproject.toml` | lint e formatação do Python |
| **import-linter** | `backend/pyproject.toml` (`[tool.importlinter]`) | fiscaliza o grafo de dependências entre `core`, `accounts`, os quatro apps de `hotel/` e `ai/` (`ARCHITECTURE.md` §3). Passo `uv run lint-imports` no CI |
| **Prettier** | `frontend/.prettierrc` | formatação única do frontend (sem `;`, aspas simples, 100 colunas), com `prettier-plugin-tailwindcss` ordenando as classes utilitárias — inclusive dentro de `cn()`/`cva()` (`tailwindFunctions`). `pnpm run format:check` é passo do CI |
| **ESLint 9**, flat config | `frontend/eslint.config.js` | `typescript-eslint` **type-aware** (`strictTypeChecked`), `jsx-a11y`, `react-hooks`, `simple-import-sort`, `testing-library`/`jest-dom` nos testes — e `no-restricted-imports` por pasta impondo as camadas `lib → components → features → pages → app`: `lib` não importa ninguém, `components` não importa features nem páginas, nenhuma feature alcança `pages` ou `app`, e uma página não alcança `app`; dentro de `features/**`/`pages/**` também é proibido `../../*` (sempre `@/`). Roda com `--max-warnings 0` |
| **TypeScript** | `frontend/tsconfig{,.app,.test,.node,.e2e}.json` | quatro programas por `references` (aplicação, testes, `vite.config.ts`, `e2e/` + `playwright.config.ts`), para que `node`, os globais de teste e o Playwright não tipem código de produção. `strict` + `noUncheckedIndexedAccess`; `pnpm run typecheck` é `tsc -b` |
| **Vitest** + cobertura v8 | `frontend/vite.config.ts` | `mockReset`/`restoreMocks` globais (nenhum teste herda dublê do vizinho) e **piso de cobertura** condicionado que falha o CI ao regredir |
| **Playwright** | `frontend/playwright.config.ts` | e2e só Chromium, `workers: 1`; `webServer` sobe gunicorn e o Vite dev sozinho; `pnpm run e2e` / `e2e:ui` / `e2e:report` |
| **`.editorconfig`** e `.vscode/` | raiz do repositório | fim de linha, indentação e format-on-save iguais para quem clonar; as extensões sugeridas cobrem os dois lados |
| **Node fixado** | `frontend/.nvmrc` (24) e `engines` no `package.json` | a versão da imagem, do CI e do caminho híbrido é uma só |
| **pnpm fixado** | `packageManager` no `package.json` (`pnpm@11.25.0`) | `corepack` (embutido no Node) lê o campo e baixa esse exato binário — mesma versão na imagem, no CI e no caminho híbrido |

Um comando cobre o frontend inteiro (`pnpm run check`, README §2); o job de frontend do CI repete os
mesmos passos, um por um e nomeados, mais a guarda de dinheiro e o upload do
relatório de cobertura.
