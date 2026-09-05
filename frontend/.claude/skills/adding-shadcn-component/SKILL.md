---
name: adding-shadcn-component
description: Vendoriza um novo primitivo shadcn/Base UI (estilo base-nova) neste projeto — sem a CLI do shadcn, direto do registro HTTP — e faz os ajustes mecânicos que o paste sempre exige (cn, ícones, strings em português, barrel). Use quando pedirem um componente shadcn novo (ex. "adiciona o Select", "preciso do Popover") ou quando `frontend/src/components/ui/` ou `frontend/components.json` estiverem sendo tocados.
argument-hint: '[component-name]'
paths: frontend/src/components/ui/**, frontend/components.json
---

# Adicionar um primitivo shadcn (Base UI)

## Antes de começar

Este projeto **não usa a CLI do shadcn** (não há Node instalado nela nesta imagem, e a CLI reformata mais do que o necessário). O registro é consumido direto por HTTP, no estilo travado em `components.json` (`base-nova`, `baseColor: slate`). Nova dependência de pacote (não só de arquivo) exige aprovação — `pnpm add` sempre com `--frozen-lockfile` respeitado no CI depois.

## Procedimento

1. Baixe o componente do registro (troque `<nome>` pelo nome do arquivo no registro, ex. `select`, `dropdown-menu`, `alert-dialog`; troque `<Nome>` pelo mesmo nome em PascalCase, ex. `Select`, `DropdownMenu`, `AlertDialog` — arquivos em `components/ui/` seguem PascalCase, nunca kebab-case, como o resto dos componentes React do projeto):

   ```bash
   curl -s https://ui.shadcn.com/r/styles/base-nova/<nome>.json | jq -r '.files[].content' \
     > frontend/src/components/ui/<Nome>.tsx
   ```

2. Ajuste o arquivo colado, sempre, nesta ordem:
   - `import { cn } from 'cn'` → `import { cn } from '@/lib/utils'`.
   - Remova qualquer `"use client"` no topo (Vite não usa RSC).
   - Troque `IconPlaceholder` (e qualquer ícone solto do registro) por um ícone real de `lucide-react` (`ChevronDownIcon`, `CheckIcon`, `XIcon`, `EllipsisIcon`, o que o componente pedir).
   - Apague classes inertes que só existem para o site do shadcn: `cn-menu-target`, `cn-menu-translucent`, `cn-rtl-flip`, `cn-font-heading`.
   - Traduza toda string visível para o usuário para português (`"Close"` → `"Fechar"`, etc.) — o `sr-only` também.
   - Se o componente precisar de `React` (ex. `forwardRef` manual), confirme o `import * as React from 'react'` no topo.
3. Exporte tudo em `frontend/src/components/ui/index.ts` (ordem alfabética do arquivo de origem, como os demais).
4. Rode `pnpm run format && pnpm run lint && pnpm run typecheck` — o bloco `files: ['src/components/ui/**/*.tsx']` do `eslint.config.js` já desliga `react-refresh/only-export-components` (componentes vendorizados costumam exportar `cva` variants junto). Se outra regra type-aware disparar só neste arquivo, relaxe **só neste bloco**, nunca globalmente.
5. **Não escreva teste para o arquivo vendorizado.** Ele testa o Base UI, não este produto — cobertura já o exclui (`vite.config.ts`: `coverage.exclude` inclui `src/components/ui/**`).
6. Só está pronto quando algum componente autoral (em `components/common/` ou numa feature) efetivamente o importa e usa — um primitivo vendorizado sem consumidor é código morto.

## Tabela de reescrita de imports mais comuns

| No registro                             | Vira                                        |
| --------------------------------------- | ------------------------------------------- |
| `import { cn } from 'cn'`               | `import { cn } from '@/lib/utils'`          |
| `import { IconPlaceholder } from '...'` | `import { <IconReal> } from 'lucide-react'` |
| `"use client"`                          | (removido)                                  |

## Gotchas

- Tema e tokens (`--color-*`, `--radius-*`) vivem em `frontend/src/index.css`, já com os 9 `@custom-variant data-*` (`data-open`, `data-closed`, `data-checked`…) inlined — não crie um novo arquivo de tema por componente.
- `dark:` compila porque o Tailwind gera a classe, mas **não há toggle de tema** neste projeto — `.dark` existe só para o build não quebrar, não para o usuário trocar.
- `Field`/`FieldLabel`/`FieldDescription`/`FieldError` (vendorizados) **não ligam `aria-describedby`/`aria-invalid` sozinhos** — quem faz isso é o composto autoral `FormField` (`components/common/FormField`). Não repita essa lógica dentro de outro primitivo vendorizado.
- `Select` sempre recebe `items` (array `{label, value}`, ordem preservada) — nunca monte as `<SelectItem>` fora dessa lista, ou o valor selecionado e o rótulo mostrado no trigger dessincronizam.
- `Checkbox` não é um `<input>` nativo — ver skill `frontend-ui-components` para como ligar no RHF.

## Pronto quando

O componente está exportado pelo barrel **e** consumido por pelo menos um chamador real (não um exemplo solto). `pnpm run build` passa, e o componente aparece na tela ao rodar `pnpm dev`.
