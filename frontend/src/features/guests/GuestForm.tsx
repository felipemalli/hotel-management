import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'

import { Alert, FormField } from '@/components/common'
import {
  Button,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import { errorMessage, isApiErrorCode } from '@/lib/errors/errors'
import { COUNTRY_OPTIONS } from '@/lib/format/countries'
import { applyServerErrors } from '@/lib/forms/forms'
import { applyBrPhoneMask, brPhoneToInternational } from '@/lib/forms/normalize'

import { useCreateGuest } from './hooks'
import { BR_PHONE_HINT, guestFormSchema, PHONE_HINT } from './schemas'
import type { CreateGuestPayload, Guest } from './types'

const FIELDS = ['full_name', 'document', 'nationality', 'phone'] as const

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
    setValue,
    getValues,
    watch,
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

  const nationality = watch('nationality')
  const isBrazil = nationality === 'BR'
  const rootError = errors.root?.server?.message

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      {rootError ? <Alert tone="error">{rootError}</Alert> : null}

      <FormField label="Nome completo" error={errors.full_name?.message}>
        {(control) => <Input placeholder="Ana Souza" {...control} {...register('full_name')} />}
      </FormField>
      <FormField
        label="Documento"
        hint="CPF, RG ou passaporte — com ou sem pontuação."
        error={errors.document?.message}
      >
        {(control) => (
          <Input placeholder="123.456.789-01" {...control} {...register('document')} />
        )}
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
                onValueChange={(value) => {
                  const next = value ?? ''
                  field.onChange(next)
                  const phone = getValues('phone')
                  if (next === 'BR') {
                    setValue('phone', applyBrPhoneMask(phone) || '55')
                    return
                  }
                  if (field.value === 'BR' && phone) {
                    setValue('phone', brPhoneToInternational(phone).replace(/^\+/, ''))
                  }
                }}
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
      <FormField
        label="Telefone"
        hint={isBrazil ? BR_PHONE_HINT : PHONE_HINT}
        error={errors.phone?.message}
      >
        {(fieldControl) => (
          <Controller
            control={control}
            name="phone"
            render={({ field }) => (
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>+</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  {...fieldControl}
                  placeholder={isBrazil ? '55 (21) 98888-7777' : '55 21 98888-7777'}
                  value={field.value}
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  onChange={(event) => {
                    const raw = event.target.value
                    field.onChange(isBrazil ? applyBrPhoneMask(raw) || '55' : raw)
                  }}
                />
              </InputGroup>
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
