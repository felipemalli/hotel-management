import { type FormEvent, useState } from 'react'

import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Input } from '@/components/ui/Input'
import { addDaysISO, todayISO } from '@/lib/dates'
import { fieldErrors } from '@/lib/errors'

import { useCreateReservation } from './hooks'
import type { Reservation } from './types'

const REQUIRED_MESSAGE = 'Campo obrigatório.'

export interface ReservationFormProps {
  guest: { id: number; full_name: string }
  onSuccess?: (reservation: Reservation) => void
  onCancel?: () => void
}

export function ReservationForm({ guest, onSuccess, onCancel }: ReservationFormProps) {
  const today = todayISO()
  const [checkinDate, setCheckinDate] = useState(today)
  const [checkoutDate, setCheckoutDate] = useState(() => addDaysISO(today, 1))
  const [hasVehicle, setHasVehicle] = useState(false)
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})

  const createReservation = useCreateReservation({ onSuccess })

  const serverErrors = fieldErrors(createReservation.error)
  const errors = { ...serverErrors, ...localErrors }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const invalid: Record<string, string> = {}
    if (!checkinDate) invalid.checkin_date = REQUIRED_MESSAGE
    if (!checkoutDate) invalid.checkout_date = REQUIRED_MESSAGE
    if (checkinDate && checkinDate < today) {
      invalid.checkin_date = 'A reserva não pode começar no passado.'
    }
    if (checkinDate && checkoutDate && checkoutDate <= checkinDate) {
      invalid.checkout_date = 'A saída deve ser depois da entrada (mínimo de 1 noite).'
    }

    setLocalErrors(invalid)
    if (Object.keys(invalid).length > 0) return

    createReservation.mutate({
      guest_id: guest.id,
      checkin_date: checkinDate,
      checkout_date: checkoutDate,
      has_vehicle: hasVehicle,
    })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      <p className="text-sm text-slate-600">
        Hóspede: <strong className="text-slate-900">{guest.full_name}</strong>
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Entrada"
          name="checkin_date"
          type="date"
          min={today}
          value={checkinDate}
          error={errors.checkin_date}
          onChange={(event) => setCheckinDate(event.target.value)}
        />
        <Input
          label="Saída"
          name="checkout_date"
          type="date"
          min={addDaysISO(checkinDate || today, 1)}
          value={checkoutDate}
          error={errors.checkout_date}
          onChange={(event) => setCheckoutDate(event.target.value)}
        />
      </div>

      <Checkbox
        label="Utilizará vaga de estacionamento"
        name="has_vehicle"
        checked={hasVehicle}
        onChange={(event) => setHasVehicle(event.target.checked)}
      />

      {errors.guest_id ? <Alert tone="error">{errors.guest_id}</Alert> : null}

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
