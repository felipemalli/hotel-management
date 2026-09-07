---
name: frontend-ui-components
description: Orienta a escolha e a construção de UI neste frontend (React + shadcn/Base UI + TanStack Table v9 + Tailwind) — quando reaproveitar um primitivo ou composto existente em vez de criar um novo, a tabela de decisão texto/listagem/campo/status, e as camadas de import. Use ao criar ou editar qualquer `.tsx` em `frontend/src`.
paths: frontend/src/**/*.tsx
---

# Componentes de UI

## Reutilize antes de criar

```bash
ls frontend/src/components/ui       # shadcn/Base UI vendorizado (sem lógica de produto)
ls frontend/src/components/common   # compostos autorais (DataTable, PageHeader, FormField…)
```

Se o que você precisa já existe num desses dois lugares, use — não escreva de novo dentro da feature.

## Tabela de decisão

| Você precisa de                                      | Use                                                                               | Onde mora                                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Qualquer texto (título, rótulo, corpo, legenda)      | `Typography` (`components/ui`)                                                    | prop `as` obrigatória; nunca `text-*`/`font-*` solto em `features/`/`pages/`        |
| Uma listagem tabular                                 | `DataTable` (`components/common`) + `columns.tsx`/`rows.ts` na própria feature    | `caption` é obrigatório (nome acessível da tabela)                                  |
| Topo de uma página (título, ação, filtro)            | `PageHeader` (`components/common`)                                                | `titleId` vira o `aria-labelledby` da `<section>` da página                         |
| Um campo de formulário                               | `FormField` (`components/common`) por cima de `Input`/`Select`/`Checkbox`         | liga `aria-describedby`/`aria-invalid` sozinho — o `Field.tsx` vendorizado não liga |
| Um rótulo de status                                  | `Badge` (`components/ui`)                                                         | variantes: `success`/`warning`/`info`/`destructive`/`secondary`                     |
| Estado de carregamento                               | `<Componente>Skeleton` ao lado do componente (ou `DataTableSkeleton` para tabela) | `role="status" aria-live="polite" aria-busy="true"` + texto `sr-only`               |
| Lista vazia ou erro de leitura                       | `EmptyState` / `ErrorState` (`components/common`)                                 | `ErrorState` sempre com `onRetry`                                                   |
| Ação secundária numa linha, ou o menu da sessão      | `DropdownMenu` (`components/ui`)                                                  | ver gotcha de jsdom abaixo antes de escrever o teste                                |
| Confirmação de ação destrutiva (desativar, cancelar) | `AlertDialog` (`components/ui`)                                                   | estado local `open` fecha o popup antes de `onClose` desmontar                      |

## Exemplos

```tsx
// ❌ — classe solta, sem Typography, sem alias
import { Button } from '../../../components/ui/Button'
;<p className="text-sm font-medium">Nenhum quarto em operação</p>

// ✅
import { Typography } from '@/components/ui'
;<Typography as="p" variant="body" weight="medium">
  Nenhum quarto em operação
</Typography>
```

```tsx
// ❌ — Select nativo, ou combobox sem valor associado ao trigger
<select><option>Brasil</option></select>

// ✅ — sempre `items`, sempre com FormField por cima
<FormField label="Nacionalidade" error={errors.nationality?.message}>
  {(control) => (
    <Select items={NATIONALITY_ITEMS} value={field.value} onValueChange={field.onChange}>
      <SelectTrigger {...control}><SelectValue placeholder="Selecione…" /></SelectTrigger>
      <SelectContent>{NATIONALITY_ITEMS.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
    </Select>
  )}
</FormField>
```

## Camadas

`lib → components → features → pages → app`. Dentro de `features/**` e `pages/**` é proibido por lint qualquer `../../` (2+ níveis) — mesmo cruzando para dentro do próprio top-level, use `@/features/<feature>/...`. `DataTable` (em `components/`) não conhece tipo de `features/`: as colunas moram sempre na feature, nunca no composto genérico.

## Gotchas

- **TanStack Table é v9**, não v8: `useTable({ features, columns, data, getRowId })`, `tableFeatures({ columnMeta: metaHelper<DataTableColumnMeta>() })` (num `.ts` sem JSX — exportar de um `.tsx` com componente dispara `react-refresh/only-export-components`), `createColumnHelper<typeof dataTableFeatures, Row>()`. Sem `getCoreRowModel`/`useReactTable`. Nunca faça spread/destructure de `row`/`cell` — os métodos são de protótipo.
- Base UI usa a prop `render`, não `asChild`: `<DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Ações do quarto 101" />}><EllipsisIcon /></DropdownMenuTrigger>`.
- `cn()` vem de `@/lib/utils`, nunca de um pacote chamado `cn`. O Prettier (`prettier-plugin-tailwindcss`, `tailwindFunctions: ["cn","cva"]`) ordena as classes automaticamente dentro de `cn(...)`/`cva(...)` — não reordene à mão.
- `Checkbox` **não é um `<input>` nativo** (é `<span role="checkbox">` + input oculto): em RHF, ligue por `Controller`/`useController` com `checked`/`onCheckedChange`, nunca `register()` direto.
- **`Select` e `DropdownMenu` nunca abrem em jsdom** (trava o teste, não só falha) — isso não muda como você escreve o componente, mas muda como você o testa: veja a skill `testing-frontend`.
- `caption` do `DataTable` é o nome acessível da tabela — sem ele, `getByRole('table', { name: ... })` não encontra nada.
- Arrays/fábricas de colunas em **camelCase** (`roomColumns`, não `ROOM_COLUMNS`) — o regex de componente do `react-refresh` casa `UPPER_SNAKE` e reclama de mistura com o resto do arquivo.
- Uma única `<p aria-live="polite" class="sr-only">` de status por página, **fora** de qualquer painel de `Tabs` que desmonta (o padrão default do `TabsContent` desmonta o painel inativo).

## Após editar

`pnpm run typecheck && pnpm run lint && pnpm run format` — e, se o componente tiver teste, rode-o isolado antes da suíte inteira.
