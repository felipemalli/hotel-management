import { type FormEvent, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AiFillGuest } from '@/features/ai/AiFillGuest'
import { errorMessage, fieldErrors, isApiErrorCode } from '@/lib/errors'

import { useCreateGuest } from './hooks'
import type { Guest } from './types'

/**
 * Cadastro de hospede (RF1, SPEC 4.3).
 *
 * As tres informacoes minimas do briefing (nome, documento, telefone) sao
 * obrigatorias aqui. O **formato** (>= 4 alfanumericos no documento, >= 8
 * digitos no telefone -- D9) e validado no servidor de proposito: duplicar a
 * regra no cliente criaria duas fontes da verdade que divergem no dia em que
 * uma mudar. O que o cliente faz e exibir o erro por campo do
 * `VALIDATION_ERROR` (SPEC 4.1) no input certo — e o `DUPLICATE_DOCUMENT` de
 * D12 no campo Documento, que e o campo culpado. Falha sem campo (rede, 500)
 * sobe para o toast global da SPEC 8.2/E, sem duplicar a mensagem na tela.
 */

const REQUIRED_MESSAGE = 'Campo obrigatório.'

export interface GuestFormProps {
  onSuccess?: (guest: Guest) => void
  onCancel?: () => void
}

export function GuestForm({ onSuccess, onCancel }: GuestFormProps) {
  const [fullName, setFullName] = useState('')
  const [document, setDocument] = useState('')
  const [phone, setPhone] = useState('')
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})

  const createGuest = useCreateGuest({
    onSuccess: (guest) => {
      setFullName('')
      setDocument('')
      setPhone('')
      onSuccess?.(guest)
    },
  })

  const serverErrors = fieldErrors(createGuest.error)
  const errors = { ...serverErrors, ...localErrors }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const missing: Record<string, string> = {}
    if (!fullName.trim()) missing.full_name = REQUIRED_MESSAGE
    if (!document.trim()) missing.document = REQUIRED_MESSAGE
    if (!phone.trim()) missing.phone = REQUIRED_MESSAGE

    setLocalErrors(missing)
    if (Object.keys(missing).length > 0) return

    createGuest.mutate({
      full_name: fullName.trim(),
      document: document.trim(),
      phone: phone.trim(),
    })
  }

  const duplicate = isApiErrorCode(createGuest.error, 'DUPLICATE_DOCUMENT')

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      {/*
        Diferencial opcional da SPEC 7: `AiFillGuest` renderiza nada enquanto a
        IA nao estiver habilitada, logo este e o formulario inteiro quando a
        chave nao existe. Corte limpo da SPEC 8.4/C1: apagar estas tres linhas
        (mais o import) e `src/features/ai/` — nada mais no frontend importa a
        feature.
      */}
      <AiFillGuest
        onFilled={(fields) => {
          if (fields.full_name) setFullName(fields.full_name)
          if (fields.document) setDocument(fields.document)
          if (fields.phone) setPhone(fields.phone)
          setLocalErrors({})
        }}
      />
      <Input
        label="Nome completo"
        name="full_name"
        value={fullName}
        error={errors.full_name}
        onChange={(event) => setFullName(event.target.value)}
      />
      <Input
        label="Documento"
        name="document"
        value={document}
        error={errors.document ?? (duplicate ? errorMessage(createGuest.error) : undefined)}
        hint="CPF, RG ou passaporte — com ou sem pontuação."
        onChange={(event) => setDocument(event.target.value)}
      />
      <Input
        label="Telefone"
        name="phone"
        value={phone}
        error={errors.phone}
        hint="Com DDD."
        onChange={(event) => setPhone(event.target.value)}
      />

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={createGuest.isPending}>
          {createGuest.isPending ? 'Cadastrando…' : 'Cadastrar hóspede'}
        </Button>
      </div>
    </form>
  )
}
