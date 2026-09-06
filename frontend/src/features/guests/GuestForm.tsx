import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'

import { Alert, FormField } from '@/components/common'
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import { errorMessage, isApiErrorCode } from '@/lib/errors/errors'
import { COUNTRY_OPTIONS } from '@/lib/format/countries'
import { applyServerErrors } from '@/lib/forms/forms'

import { useCreateGuest } from './hooks'
import { guestFormSchema, PHONE_HINT } from './schemas'
import type { CreateGuestPayload, Guest } from './types'

const FIELDS = ['full_name', 'document', 'phone', 'nationality'] as const

const NATIONALITY_ITEMS = COUNTRY_OPTIONS.map((option) => ({
  value: option.code,
  label: option.name,
}))

export interface GuestFormProps {
  onSuccess?: (guest: Guest) => void
  onCancel?: () => void
}

export function GuestForm({ onSuccess, onCancel }: GuestFormProps) {
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
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

      <FormField label="Nome completo" error={errors.full_name?.message}>
        {(control) => <Input {...control} {...register('full_name')} />}
      </FormField>
      <FormField
        label="Documento"
        hint="CPF, RG ou passaporte — com ou sem pontuação."
        error={errors.document?.message}
      >
        {(control) => <Input {...control} {...register('document')} />}
      </FormField>
      <FormField label="Telefone" hint={PHONE_HINT} error={errors.phone?.message}>
        {(control) => <Input {...control} {...register('phone')} />}
      </FormField>
      <FormField label="Nacionalidade" error={errors.nationality?.message}>
        {(selectControl) => (
          <Controller
            control={control}
            name="nationality"
            render={({ field }) => (
              <Select
                items={NATIONALITY_ITEMS}
                value={field.value === '' ? null : field.value}
                onValueChange={(value) => field.onChange(value ?? '')}
              >
                <SelectTrigger {...selectControl} onBlur={field.onBlur} className="w-full">
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {NATIONALITY_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        )}
      </FormField>

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button variant="outline" onClick={onCancel}>
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
