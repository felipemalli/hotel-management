import { useId, useState } from 'react'

import { Button, DismissButton, Input } from '@/components/ui'
import { useGuests } from '@/features/guests/hooks'
import { DEBOUNCE_MS } from '@/features/guests/tabs'
import { errorMessage } from '@/lib/errors'
import { formatDocument } from '@/lib/pii'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

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
  const debounced = useDebouncedValue(search, DEBOUNCE_MS)
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
      <legend className="text-sm font-medium text-slate-800">Acompanhantes</legend>

      {value.length > 0 ? (
        <ul aria-label="Acompanhantes escolhidos" className="flex flex-wrap gap-2">
          {value.map((companion) => (
            <li
              key={companion.id}
              className="flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pr-1 pl-3 text-sm text-slate-800 ring-1 ring-slate-200 ring-inset"
            >
              {companion.full_name}
              <DismissButton
                label={`Remover ${companion.full_name}`}
                onClick={() => onChange(value.filter((kept) => kept.id !== companion.id))}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">
          Nenhum acompanhante. Só hóspedes já cadastrados podem ser adicionados.
        </p>
      )}

      <Input
        label="Buscar acompanhante"
        type="search"
        placeholder="Nome, documento ou telefone"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {term ? renderCandidates() : null}

      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </fieldset>
  )

  // Função, e não componente aninhado: um componente declarado dentro do render
  // é um tipo novo a cada passagem, e o React remontaria a lista inteira.
  function renderCandidates() {
    if (results.isPending) {
      return (
        <p role="status" className="text-xs text-slate-500">
          Buscando…
        </p>
      )
    }

    if (results.isError) {
      return (
        <p role="alert" className="text-xs font-medium text-red-700">
          {errorMessage(results.error)}
        </p>
      )
    }

    if (candidates.length === 0) {
      return <p className="text-xs text-slate-500">Nenhum hóspede encontrado.</p>
    }

    return (
      <ul aria-label="Resultados da busca" className="flex flex-col gap-1">
        {candidates.map((guest) => (
          <li key={guest.id} className="flex items-center justify-between gap-3 text-sm">
            <span>
              {guest.full_name}{' '}
              <span className="font-mono text-xs text-slate-500">
                {formatDocument(guest.document)}
              </span>
            </span>
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Adicionar ${guest.full_name}`}
              onClick={() => {
                onChange([...value, { id: guest.id, full_name: guest.full_name }])
                setSearch('')
              }}
            >
              Adicionar
            </Button>
          </li>
        ))}
      </ul>
    )
  }
}
