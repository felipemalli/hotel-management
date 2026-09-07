import { useId, useState } from 'react'

import { DismissButton, FormField } from '@/components/common'
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
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
  error?: string
}

export function CompanionPicker({ holderId, value, onChange, error }: CompanionPickerProps) {
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, SEARCH_DEBOUNCE_MS)
  const term = debounced.trim()
  const errorId = useId()

  // Caixa vazia não consulta: traria a primeira página de todos os hóspedes.
  const results = useGuests(term, 1, { enabled: term.length > 0 })

  const chosen = new Set(value.map((companion) => companion.id))
  const candidates = (results.data?.results ?? []).filter(
    (guest) => guest.id !== holderId && !chosen.has(guest.id),
  )

  function addCompanion(guest: Guest) {
    onChange([...value, { id: guest.id, full_name: guest.full_name }])
    setSearch('')
  }

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? errorId : undefined}>
      <Typography as="legend" variant="label">
        Acompanhantes
      </Typography>

      {value.length > 0 ? (
        <ul aria-label="Acompanhantes escolhidos" className="flex flex-wrap gap-2">
          {value.map((companion) => (
            <Typography
              as="li"
              key={companion.id}
              variant="body"
              className="flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pr-1 pl-3 ring-1 ring-slate-200 ring-inset"
            >
              {companion.full_name}
              <DismissButton
                label={`Remover ${companion.full_name}`}
                onClick={() => onChange(value.filter((kept) => kept.id !== companion.id))}
              />
            </Typography>
          ))}
        </ul>
      ) : (
        <Typography as="p" variant="caption">
          Nenhum acompanhante. Só hóspedes já cadastrados podem ser adicionados.
        </Typography>
      )}

      <FormField label="Buscar acompanhante">
        {(control) => (
          <Combobox
            items={candidates}
            inputValue={search}
            onInputValueChange={setSearch}
            onValueChange={(guest: Guest | null) => {
              if (guest) addCompanion(guest)
            }}
            itemToStringLabel={(guest: Guest) => guest.full_name}
            filter={null}
            open={term.length > 0}
          >
            <ComboboxInput
              placeholder="Nome, documento ou telefone"
              showTrigger={false}
              {...control}
            />
            <ComboboxContent>
              {renderPopupBody()}
            </ComboboxContent>
          </Combobox>
        )}
      </FormField>

      {error ? (
        <Typography
          as="p"
          id={errorId}
          role="alert"
          variant="caption"
          tone="destructive"
          weight="medium"
        >
          {error}
        </Typography>
      ) : null}
    </fieldset>
  )

  // Função, não componente aninhado: tipo novo a cada render remontaria a lista.
  function renderPopupBody() {
    if (results.isPending) {
      return (
        <Typography as="p" role="status" variant="caption" className="p-2">
          Buscando…
        </Typography>
      )
    }

    if (results.isError) {
      return (
        <Typography as="p" role="alert" variant="caption" tone="destructive" weight="medium" className="p-2">
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
        {candidates.map((guest) => (
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
