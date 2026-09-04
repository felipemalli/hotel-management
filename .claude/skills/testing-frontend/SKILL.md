---
name: testing-frontend
description: Escreve ou revisa testes do frontend (Vitest, Testing Library, Playwright) deste projeto de gestão hoteleira — qual camada testar, o que nunca mockar, os ids de teste normativos, e a limitação conhecida do Base UI (Select/DropdownMenu) em jsdom. Use ao adicionar, mover ou depurar um `*.test.ts(x)` em `frontend/src` ou um spec em `frontend/e2e`.
paths: frontend/src/**/*.test.{ts,tsx}, frontend/src/test/**, frontend/vite.config.ts, frontend/e2e/**
---

# Testes de frontend

## Não-negociáveis

- **Único mock permitido em teste de integração: `@/features/<feature>/api`** (`vi.mock`). Nunca mockar um hook, o axios ou o router. MSW foi avaliado e recusado (README §3) — ele dublaria a mesma camada mais abaixo, sem provar nada a mais.
- **Os ids de `it(...)` na matriz RF/RN do RESUMO-DO-PROJETO.md §10 (local) são imutáveis.** O arquivo pode mudar de pasta; o nome do arquivo e o id do caso não mudam sem que a matriz mude primeiro. O CI tem um guard (`ci.yml` job `frontend`) que falha se um id sumir.
- **`__fixtures__/bills.ts` (T1–T9) é intocável.** Dinheiro em teste é sempre a string literal da fixture (`'R$ 425,00'`), nunca uma conta feita no teste — o cálculo mora no backend.
- **Componente vendorizado (`src/components/ui/**`) nunca ganha teste próprio.** Ele testa o Base UI, não o produto.

## Qual teste para quê

| O que você quer provar | Onde | Como |
| --- | --- | --- |
| Função pura, sem UI (dinheiro, data, PII, schema com regra) | `lib/**/*.test.ts`, `features/*/schemas.test.ts` | `vitest` direto, sem montar nada |
| Componente ou feature isolado | `Componente.test.tsx` ao lado do componente | `renderWithProviders` (`@/test/renderWithProviders`) |
| Página inteira, ou um fluxo que atravessa páginas | `pages/<Página>/*.test.tsx` (flows ficam ao lado da página que exercitam, não da feature) | `renderPage` (`@/test/renderPage`) — monta dentro do `AppLayout` real |
| Fluxo real contra o backend rodando | `frontend/e2e/*.spec.ts` | Playwright — único lugar onde a interação de `Select`/`DropdownMenu` é provada (ver gotcha abaixo) |

## Esqueleto real

```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ROOM_101 } from '@/features/rooms/__fixtures__/rooms'
import { updateRoom } from '@/features/rooms/api'
import { renderWithProviders } from '@/test/renderWithProviders'

import { RoomDeactivateDialog } from './RoomDeactivateDialog'

vi.mock('@/features/rooms/api')

describe('RoomDeactivateDialog', () => {
  it('desativa apos confirmar e avisa por toast', async () => {
    const user = userEvent.setup()
    vi.mocked(updateRoom).mockResolvedValue({ ...ROOM_101, is_active: false })
    renderWithProviders(<RoomDeactivateDialog room={ROOM_101} onClose={vi.fn()} onDeactivated={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Desativar' }))

    await waitFor(() => expect(updateRoom).toHaveBeenCalledWith(ROOM_101.id, { is_active: false }))
  })
})
```

## Helpers que existem de verdade

- `@/test/renderWithProviders` → `renderWithProviders(ui, options?)`, `signInForTest(username?)`, `resetGlobalStores()`.
- `@/test/renderPage` → `renderPage(page, { route, path?, queryClient? })`.
- `@/test/fixtures` → `page(results)` (envelope DRF), `elementAt(list, index)` (acessa um índice de uma `NodeList`/array com erro legível em vez de `undefined`).
- Não existem `select.ts`/`table.ts` dedicados em `src/test/` — o padrão estabelecido é `within(table).getAllByRole('row')` + `elementAt(rows, i)` direto no teste. Se você extrair um helper, documente aqui.
- `frontend/e2e/support.ts` → `login(page, credentials?)`, `uniqueDocument()`, `selectOption(page, comboboxName, optionName)`, `selectFirstOption(page, comboboxName)` — só para specs Playwright.

## O que vale testar, o que não vale

Vale: contrato consumido fielmente (schema, formatação), a consequência visível de uma regra (badge, mensagem, linha que aparece/some), a condução de um protocolo (409 → diálogo → reenvio). Não vale: classe CSS, `forwardRef`, ordem de chaves de um objeto, texto de uma `<option>`, string de rota solta, plumbing de resolver do RHF quando o schema já prova a mesma entrada (a ponte schema → RHF é responsabilidade do teste normativo do formulário, que já a exercita via submit real).

## Gotchas

- **`Select` e `DropdownMenu` (Base UI) nunca abrem em jsdom.** Confirmado empiricamente com specs mínimos usando os primitivos crus do Base UI (sem nenhum código deste projeto): `fireEvent.click`/`userEvent.click` no trigger trava o worker de teste por dezenas de segundos antes do próprio timeout do Vitest estourar — não é "às vezes falha", é sempre. **Não tente abrir um destes dois em RTL.** Monte o componente já no estado que quer provar (ex.: uma `AlertDialog`/`Dialog` filha aberta direto, sem passar pelo menu que a dispara) e deixe a interação real do menu para o e2e. Ver `RoomDeactivateDialog.test.tsx`, `RoomCapacityDialog.test.tsx` e `AppLayout.test.tsx` para o padrão de contorno.
- Com um `Dialog`/`AlertDialog` aberto, o resto da página vira `aria-hidden`: use `getByRole(..., { hidden: true })` para consultar o que ficou por trás, ou afirme depois de fechar.
- `Toaster` não é montado por `renderPage`; afirme toast via `toastStore.getSnapshot()` (`@/lib/notify/toast`), não pela tela.
- Toasts somem sozinhos após alguns segundos — afirme logo após o clique, não deixe o teste "esperar" por eles.
- `e2e/**` fica fora do Vitest por construção (`vite.config.ts`: `test.include` é `src/**/*.test.{ts,tsx}`) — um `.spec.ts` em `e2e/` nunca roda pelo Vitest, e um `.test.ts` em `src/` nunca roda pelo Playwright.
- Pinos de cobertura 100% (`money.ts`, `dates.ts`, `normalize.ts`) e 95/90 (`features/*/schemas.ts`) são alarme, não meta — não invente teste só para subir percentual; a rastreabilidade RF/RN (README §3.1) é a prova real.
- Nunca faça spread/destructure de `row`/`cell` do TanStack Table v9 — os métodos (`row.original`, `row.getAllCells()`) são de protótipo e desaparecem no spread.

## Antes de terminar

`pnpm run typecheck` → `pnpm run test:run <arquivo>` (o arquivo que você tocou, isolado) → `pnpm run test:coverage` (a suíte inteira, com os pinos) → `pnpm run lint` → `pnpm run format:check`. Se mexeu em `e2e/`, rode `pnpm exec playwright test --list` para confirmar que o config ainda descobre os specs (não precisa do backend no ar para isso).
