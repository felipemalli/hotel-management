import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { Alert } from '@/components/common'
import { Button, Input } from '@/components/ui'
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

      <p className="text-sm text-slate-600">
        A tarifa vale a partir da publicação e rege apenas as estadias cujo check-in acontecer
        depois dela: quem já entrou mantém a tarifa amarrada no seu check-in.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Diária (seg–sex)"
          inputMode="decimal"
          hint="Em reais: 120 ou 120,50."
          error={errors.weekday_rate?.message}
          {...register('weekday_rate')}
        />
        <Input
          label="Diária (sáb–dom)"
          inputMode="decimal"
          error={errors.weekend_rate?.message}
          {...register('weekend_rate')}
        />
        <Input
          label="Vaga (seg–sex)"
          inputMode="decimal"
          error={errors.weekday_park?.message}
          {...register('weekday_park')}
        />
        <Input
          label="Vaga (sáb–dom)"
          inputMode="decimal"
          error={errors.weekend_park?.message}
          {...register('weekend_park')}
        />
      </div>

      <Input
        label="Fator da multa de checkout tardio"
        inputMode="decimal"
        hint="Fração da diária do dia da saída: 0,5 é metade."
        error={errors.late_fee_factor?.message}
        {...register('late_fee_factor')}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Abertura do check-in"
          type="time"
          error={errors.checkin_opens?.message}
          {...register('checkin_opens')}
        />
        <Input
          label="Limite de checkout"
          type="time"
          hint="Igual ou anterior à abertura do check-in."
          error={errors.checkout_limit?.message}
          {...register('checkout_limit')}
        />
      </div>

      <Input
        label="Nota (opcional)"
        hint="Até 200 caracteres."
        error={errors.note?.message}
        {...register('note')}
      />

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
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
