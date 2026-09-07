import { useState } from 'react'

import { FormField } from '@/components/common'
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  Typography,
} from '@/components/ui'
import { useGuests } from '@/features/guests/hooks'
import type { Guest } from '@/features/guests/types'
import type { GuestRef } from '@/features/reservations/types'
import { errorMessage } from '@/lib/errors/errors'
import { formatDocument } from '@/lib/format/pii'
import { SEARCH_DEBOUNCE_MS, useDebouncedValue } from '@/lib/hooks/useDebouncedValue'

export interface CompanionPickerProps {
  holderId: number
  value: readonly GuestRef[]
  onChange: (next: GuestRef[]) => void
  onDraftChange?: (draft: string) => void
  excludeIds?: readonly number[]
  label?: string
  hideLabel?: boolean
  hint?: string
  hintClassName?: string
  error?: string
  disabled?: boolean
}

export function CompanionPicker({
  holderId,
  value,
  onChange,
  onDraftChange,
  excludeIds = [],
  label = 'Acompanhantes',
  hideLabel,
  hint = 'Só hóspedes já cadastrados podem ser adicionados.',
  hintClassName,
  error,
  disabled,
}: CompanionPickerProps) {
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, SEARCH_DEBOUNCE_MS)
  const term = debounced.trim()
  const query = search.trim()

  // Caixa vazia não consulta: traria a primeira página de todos os hóspedes.
  const results = useGuests(term, 1, { enabled: term.length > 0, keepPrevious: false })

  const blocked = new Set([holderId, ...value.map((companion) => companion.id), ...excludeIds])
  const candidates = (results.data?.results ?? []).filter((guest) => !blocked.has(guest.id))
  const waiting = query.length > 0 && (term !== query || results.isPending)

  function setDraft(next: string) {
    setSearch(next)
    onDraftChange?.(next)
  }

  return (
    <FormField
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      hintClassName={hintClassName}
      error={error}
    >
      {(control) => (
        <Combobox
          items={candidates}
          multiple
          value={[...value]}
          disabled={disabled}
          onValueChange={(next) => {
            onChange(next.map((guest) => ({ id: guest.id, full_name: guest.full_name })))
            setDraft('')
          }}
          inputValue={search}
          onInputValueChange={(next, details) => {
            if (details.isItemPress) {
              setDraft('')
              return
            }
            if (next === '' && details.reason !== 'input-change') {
              // Fechar o popup no clique de Criar limparia o texto e a reserva sairia sem o acompanhante.
              details.cancel()
              return
            }
            setDraft(next)
          }}
          itemToStringLabel={(guest: GuestRef) => guest.full_name}
          isItemEqualToValue={(left: GuestRef, right: GuestRef) => left.id === right.id}
          filter={null}
        >
          <div className="relative">
            <ComboboxChips
              className="flex min-h-0 w-full flex-col flex-nowrap items-stretch gap-1.5 rounded-none border-0 bg-transparent p-0 shadow-none ring-0 focus-within:border-transparent focus-within:ring-0 has-aria-invalid:border-transparent has-aria-invalid:ring-0 has-data-[slot=combobox-chip]:px-0 dark:bg-transparent"
              aria-label={value.length > 0 ? 'Acompanhantes escolhidos' : undefined}
            >
              <ComboboxValue>
                {(selected: GuestRef[]) =>
                  selected.map((companion) => (
                    <ComboboxChip
                      key={companion.id}
                      removeLabel={`Remover ${companion.full_name}`}
                      aria-label={companion.full_name}
                      aria-description="Pressione Backspace ou Delete para remover"
                      className="h-9 w-full max-w-none justify-between gap-2.5 rounded-lg border border-border bg-card px-3 py-0 text-sm font-normal has-data-[slot=combobox-chip-remove]:pr-1.5"
                      removeClassName="size-[1.625rem] rounded-md opacity-45 hover:bg-destructive/10 hover:opacity-100"
                    >
                      <span className="min-w-0 flex-1 truncate">{companion.full_name}</span>
                    </ComboboxChip>
                  ))
                }
              </ComboboxValue>
              <ComboboxChipsInput
                {...control}
                placeholder="Nome, documento ou telefone"
                autoComplete="off"
                disabled={disabled}
                className="h-9 min-w-0 flex-none rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && query.length > 0 && candidates.length === 0) {
                    event.preventDefault()
                  }
                }}
              />
            </ComboboxChips>
            {query.length > 0 ? (
              <div
                className="absolute top-full z-50 mt-1 max-h-60 w-full overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10"
                aria-busy={waiting || undefined}
              >
                {renderPopupBody()}
              </div>
            ) : null}
          </div>
        </Combobox>
      )}
    </FormField>
  )

  // Função, não componente aninhado: tipo novo a cada render remontaria a lista.
  function renderPopupBody() {
    if (waiting) {
      return (
        <Typography as="p" role="status" variant="caption" className="p-2">
          Buscando…
        </Typography>
      )
    }

    if (results.isError) {
      return (
        <Typography
          as="p"
          role="alert"
          variant="caption"
          tone="destructive"
          weight="medium"
          className="p-2"
        >
          {errorMessage(results.error)}
        </Typography>
      )
    }

    if (candidates.length === 0) {
      return (
        <Typography as="p" variant="caption" className="p-2">
          Nenhum hóspede encontrado.
        </Typography>
      )
    }

    return (
      <ComboboxList>
        {candidates.map((guest: Guest) => (
          <ComboboxItem key={guest.id} value={guest}>
            {guest.full_name}{' '}
            <Typography as="span" variant="mono" tone="muted">
              {formatDocument(guest.document)}
            </Typography>
          </ComboboxItem>
        ))}
      </ComboboxList>
    )
  }
}
