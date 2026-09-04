import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { Alert, FormField } from '@/components/common'
import { Button, Input, Typography } from '@/components/ui'
import { applyServerErrors } from '@/lib/forms/forms'

import { useCreatePolicy } from './hooks'
import { policyFormSchema, policyToFormValues } from './schemas'
import type { CreatePolicyPayload, PolicyFormValues, PricingPolicy } from './types'

const FIELDS = [
  'weekday_rate',
  'weekend_rate',
  'weekday_park',
  'weekend_park',
  'late_fee_factor',
  'checkin_opens',
  'checkout_limit',
  'note',
] as const

export interface PolicyFormProps {
  current: PricingPolicy
  onSuccess?: (policy: PricingPolicy) => void
  onCancel?: () => void
}

export function PolicyForm({ current, onSuccess, onCancel }: PolicyFormProps) {
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<PolicyFormValues, unknown, CreatePolicyPayload>({
    resolver: zodResolver(policyFormSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    // Pré-preenchido com a vigente: publicar é editar o que muda, e digitar os
    // sete valores de novo convidaria ao erro no que não deveria mudar.
    defaultValues: policyToFormValues(current),
  })

  const createPolicy = useCreatePolicy({ onSuccess })

  const submit = handleSubmit((payload) => {
    createPolicy.mutate(payload, {
      onError: (error) => {
        applyServerErrors(error, setError, FIELDS)
      },
    })
  })

  const rootError = errors.root?.server?.message

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      {rootError ? <Alert tone="error">{rootError}</Alert> : null}

      <Typography as="p" variant="body" tone="muted">
        A tarifa vale a partir da publicação e rege apenas as estadias cujo check-in acontecer
        depois dela: quem já entrou mantém a tarifa amarrada no seu check-in.
      </Typography>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Diária (seg–sex)"
          hint="Em reais: 120 ou 120,50."
          error={errors.weekday_rate?.message}
        >
          {(control) => <Input inputMode="decimal" {...control} {...register('weekday_rate')} />}
        </FormField>
        <FormField label="Diária (sáb–dom)" error={errors.weekend_rate?.message}>
          {(control) => <Input inputMode="decimal" {...control} {...register('weekend_rate')} />}
        </FormField>
        <FormField label="Vaga (seg–sex)" error={errors.weekday_park?.message}>
          {(control) => <Input inputMode="decimal" {...control} {...register('weekday_park')} />}
        </FormField>
        <FormField label="Vaga (sáb–dom)" error={errors.weekend_park?.message}>
          {(control) => <Input inputMode="decimal" {...control} {...register('weekend_park')} />}
        </FormField>
      </div>

      <FormField
        label="Fator da multa de checkout tardio"
        hint="Fração da diária do dia da saída: 0,5 é metade."
        error={errors.late_fee_factor?.message}
      >
        {(control) => <Input inputMode="decimal" {...control} {...register('late_fee_factor')} />}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Abertura do check-in" error={errors.checkin_opens?.message}>
          {(control) => <Input type="time" {...control} {...register('checkin_opens')} />}
        </FormField>
        <FormField
          label="Limite de checkout"
          hint="Igual ou anterior à abertura do check-in."
          error={errors.checkout_limit?.message}
        >
          {(control) => <Input type="time" {...control} {...register('checkout_limit')} />}
        </FormField>
      </div>

      <FormField label="Nota (opcional)" hint="Até 200 caracteres." error={errors.note?.message}>
        {(control) => <Input {...control} {...register('note')} />}
      </FormField>

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={createPolicy.isPending}>
          {createPolicy.isPending ? 'Publicando…' : 'Publicar tarifa'}
        </Button>
      </div>
    </form>
  )
}
