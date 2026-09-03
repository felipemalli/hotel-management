import { type FormEvent, useState } from 'react'

import { Button, Input } from '@/components/ui'
import { AiFillGuest } from '@/features/ai/AiFillGuest'
import { errorMessage, fieldErrors, isApiErrorCode } from '@/lib/errors'

import { useCreateGuest } from './hooks'
import type { Guest } from './types'

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
