import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { Alert, Button, Input, Select } from '@/components/ui'
import { AiFillGuest } from '@/features/ai/AiFillGuest'
import { COUNTRY_OPTIONS } from '@/lib/countries'
import { errorMessage, isApiErrorCode } from '@/lib/errors'
import { applyServerErrors } from '@/lib/forms'

import { useCreateGuest } from './hooks'
import { guestFormSchema, PHONE_HINT } from './schemas'
import type { CreateGuestPayload, Guest } from './types'

const FIELDS = ['full_name', 'document', 'phone', 'nationality'] as const

export interface GuestFormProps {
  onSuccess?: (guest: Guest) => void
  onCancel?: () => void
}

export function GuestForm({ onSuccess, onCancel }: GuestFormProps) {
  const {
    clearErrors,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
  } = useForm<CreateGuestPayload>({
    resolver: zodResolver(guestFormSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { full_name: '', document: '', phone: '', nationality: '' },
  })

  const createGuest = useCreateGuest({
    onSuccess: (guest) => {
      reset()
      onSuccess?.(guest)
    },
  })

  const submit = handleSubmit((payload) => {
    createGuest.mutate(payload, {
      onError: (error) => {
        if (isApiErrorCode(error, 'DUPLICATE_DOCUMENT')) {
          setError('document', { type: 'server', message: errorMessage(error) })
          return
        }
        applyServerErrors(error, setError, FIELDS)
      },
    })
  })

  const rootError = errors.root?.server?.message

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      {rootError ? <Alert tone="error">{rootError}</Alert> : null}

      <AiFillGuest
        onFilled={(fields) => {
          if (fields.full_name) setValue('full_name', fields.full_name)
          if (fields.document) setValue('document', fields.document)
          if (fields.phone) setValue('phone', fields.phone)
          clearErrors()
        }}
      />
      <Input label="Nome completo" error={errors.full_name?.message} {...register('full_name')} />
      <Input
        label="Documento"
        hint="CPF, RG ou passaporte — com ou sem pontuação."
        error={errors.document?.message}
        {...register('document')}
      />
      <Input
        label="Telefone"
        hint={PHONE_HINT}
        error={errors.phone?.message}
        {...register('phone')}
      />
      <Select
        label="Nacionalidade"
        error={errors.nationality?.message}
        {...register('nationality')}
      >
        <option value="">Selecione…</option>
        {COUNTRY_OPTIONS.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
      </Select>

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
