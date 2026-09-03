import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Alert, Button, Checkbox, Input } from '@/components/ui'
import type { GuestRef } from '@/features/guests/types'
import { addDaysISO, todayISO } from '@/lib/dates'
import { applyServerErrors } from '@/lib/forms'

import { useCreateReservation } from './hooks'
import { reservationFormSchema } from './schemas'
import type { CreateReservationPayload, Reservation } from './types'

// `guest_id` não tem campo na tela: um erro do servidor sobre ele vai para o
// alerta do topo em vez de sumir num campo que o atendente não vê.
const FIELDS = ['checkin_date', 'checkout_date', 'has_vehicle'] as const

export interface ReservationFormProps {
  guest: GuestRef
  onSuccess?: (reservation: Reservation) => void
  onCancel?: () => void
}

export function ReservationForm({ guest, onSuccess, onCancel }: ReservationFormProps) {
  // Hoje é lido uma vez na montagem: recomputar a cada render faria um
  // formulário aberto durante a virada do dia recusar a própria data padrão.
  const [today] = useState(todayISO)
  const schema = useMemo(() => reservationFormSchema(today), [today])

  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
    watch,
  } = useForm<CreateReservationPayload>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      guest_id: guest.id,
      checkin_date: today,
      checkout_date: addDaysISO(today, 1),
      has_vehicle: false,
    },
  })

  const createReservation = useCreateReservation({ onSuccess })

  const submit = handleSubmit((payload) => {
    createReservation.mutate(payload, {
      onError: (error) => {
        applyServerErrors(error, setError, FIELDS)
      },
    })
  })

  const checkinDate = watch('checkin_date')
  const rootError = errors.root?.server?.message

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      {rootError ? <Alert tone="error">{rootError}</Alert> : null}

      <p className="text-sm text-slate-600">
        Hóspede: <strong className="text-slate-900">{guest.full_name}</strong>
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Entrada"
          type="date"
          min={today}
          error={errors.checkin_date?.message}
          {...register('checkin_date')}
        />
        <Input
          label="Saída"
          type="date"
          min={addDaysISO(checkinDate || today, 1)}
          error={errors.checkout_date?.message}
          {...register('checkout_date')}
        />
      </div>

      <Checkbox
        label="Utilizará vaga de estacionamento"
        error={errors.has_vehicle?.message}
        {...register('has_vehicle')}
      />

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={createReservation.isPending}>
          {createReservation.isPending ? 'Criando…' : 'Criar reserva'}
        </Button>
      </div>
    </form>
  )
}
