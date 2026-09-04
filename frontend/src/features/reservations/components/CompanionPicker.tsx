import { useId, useState } from 'react'

import { DismissButton, FormField } from '@/components/common'
import { Button, Input, Typography } from '@/components/ui'
import { useGuests } from '@/features/guests/hooks'
import { errorMessage } from '@/lib/errors/errors'
import { formatDocument } from '@/lib/format/pii'
import { SEARCH_DEBOUNCE_MS, useDebouncedValue } from '@/lib/hooks/useDebouncedValue'

import type { GuestRef } from '../types'

export interface CompanionPickerProps {
  holderId: number
  value: readonly GuestRef[]
  onChange: (next: GuestRef[]) => void
  error?: string
}

// Acompanhante é hóspede completo (D19), então aqui só se ESCOLHE quem já está
// cadastrado — cadastrar alguém no meio de uma reserva abriria um segundo
// caminho de escrita para a mesma regra.
export function CompanionPicker({ holderId, value, onChange, error }: CompanionPickerProps) {
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, SEARCH_DEBOUNCE_MS)
  const term = debounced.trim()
  const errorId = useId()

  // Sem termo não há consulta: buscar com a caixa vazia traria a primeira
  // página de todos os hóspedes, que não é uma sugestão, é ruído.
  const results = useGuests(term, 1, { enabled: term.length > 0 })

  const chosen = new Set(value.map((companion) => companion.id))
  const candidates = (results.data?.results ?? []).filter(
    (guest) => guest.id !== holderId && !chosen.has(guest.id),
  )

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
          <Input
            type="search"
            placeholder="Nome, documento ou telefone"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            {...control}
          />
        )}
      </FormField>

      {term ? renderCandidates() : null}

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

  // Função, e não componente aninhado: um componente declarado dentro do render
  // é um tipo novo a cada passagem, e o React remontaria a lista inteira.
  function renderCandidates() {
    if (results.isPending) {
      return (
        <Typography as="p" role="status" variant="caption">
          Buscando…
        </Typography>
      )
    }

    if (results.isError) {
      return (
        <Typography as="p" role="alert" variant="caption" tone="destructive" weight="medium">
          {errorMessage(results.error)}
        </Typography>
      )
    }

    if (candidates.length === 0) {
      return (
        <Typography as="p" variant="caption">
          Nenhum hóspede encontrado.
        </Typography>
      )
    }

    return (
      <ul aria-label="Resultados da busca" className="flex flex-col gap-1">
        {candidates.map((guest) => (
          <Typography
            as="li"
            key={guest.id}
            variant="body"
            className="flex items-center justify-between gap-3"
          >
            <span>
              {guest.full_name}{' '}
              <Typography as="span" variant="mono" tone="muted">
                {formatDocument(guest.document)}
              </Typography>
            </span>
            <Button
              size="sm"
              variant="outline"
              aria-label={`Adicionar ${guest.full_name}`}
              onClick={() => {
                onChange([...value, { id: guest.id, full_name: guest.full_name }])
                setSearch('')
              }}
            >
              Adicionar
            </Button>
          </Typography>
        ))}
      </ul>
    )
  }
}
