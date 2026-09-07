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
  error?: string
}

export function CompanionPicker({
  holderId,
  value,
  onChange,
  onDraftChange,
  excludeIds = [],
  label = 'Acompanhantes',
  error,
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
    <FormField label={label} hint="Só hóspedes já cadastrados podem ser adicionados." error={error}>
      {(control) => (
        <Combobox
          items={candidates}
          multiple
          value={[...value]}
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
              className="w-full"
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
                    >
                      {companion.full_name}
                    </ComboboxChip>
                  ))
                }
              </ComboboxValue>
              <ComboboxChipsInput
                {...control}
                placeholder={value.length > 0 ? 'Adicionar…' : 'Nome, documento ou telefone'}
                autoComplete="off"
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
