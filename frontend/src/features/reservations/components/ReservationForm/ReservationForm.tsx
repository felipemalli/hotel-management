import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { Controller, useController, useForm } from 'react-hook-form'

import { Alert, FormField } from '@/components/common'
import {
  Button,
  Checkbox,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Typography,
} from '@/components/ui'
import type { GuestRef as GuestSummary } from '@/features/guests/types'
import { CompanionPicker } from '@/features/reservations/components/CompanionPicker'
import { useCreateReservation } from '@/features/reservations/hooks'
import { reservationFormSchema } from '@/features/reservations/schemas'
import type {
  CreateReservationPayload,
  GuestRef,
  Reservation,
  ReservationFormValues,
} from '@/features/reservations/types'
import { useAvailableRooms } from '@/features/rooms/hooks'
import { useInvalidateServerState } from '@/lib/api/useInvalidateServerState'
import { errorMessage, roomUnavailableInfo } from '@/lib/errors/errors'
import { addDaysISO, formatISODate, todayISO } from '@/lib/format/dates'
import { applyServerErrors } from '@/lib/forms/forms'

// guest_id não tem campo: erro do servidor vai ao alerta do topo.
const FIELDS = ['checkin_date', 'checkout_date', 'has_vehicle', 'room_id', 'companion_ids'] as const

export interface ReservationFormProps {
  guest: GuestSummary
  onSuccess?: (reservation: Reservation) => void
  onCancel?: () => void
}

export function ReservationForm({ guest, onSuccess, onCancel }: ReservationFormProps) {
  // Hoje lido na montagem: virada do dia no formulário aberto recusaria a data padrão.
  const [today] = useState(todayISO)
  const schema = useMemo(() => reservationFormSchema(today), [today])

  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    setError,
    watch,
  } = useForm<ReservationFormValues, unknown, CreateReservationPayload>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      guest_id: guest.id,
      room_id: null,
      companion_ids: [],
      checkin_date: today,
      checkout_date: addDaysISO(today, 1),
      has_vehicle: false,
    },
  })

  const room = useController({ control, name: 'room_id' })
  const companionIds = useController({ control, name: 'companion_ids' })
  const [companions, setCompanions] = useState<GuestRef[]>([])

  const invalidateServerState = useInvalidateServerState()
  const createReservation = useCreateReservation({ onSuccess })

  const checkinDate = watch('checkin_date')
  const checkoutDate = watch('checkout_date')

  // Fora deste intervalo o servidor responderia 400.
  const datesValid = checkinDate >= today && checkoutDate > checkinDate
  const people = 1 + companionIds.field.value.length
  const availability = useAvailableRooms(
    { checkin_date: checkinDate, checkout_date: checkoutDate, people },
    { enabled: datesValid },
  )

  // Dependência do efeito que limpa o quarto: array novo a cada render dispararia à toa.
  const rooms = useMemo(() => availability.data?.results ?? [], [availability.data])
  const roomItems = rooms.map((candidate) => ({
    value: candidate.id,
    label: `${candidate.number} · capacidade ${candidate.capacity}`,
  }))
  const roomId = room.field.value
  const roomField = room.field

  // Quarto fora da lista nova volta ao vazio. Só com dado fresco, não o placeholder.
  useEffect(() => {
    if (roomId === null || !availability.isSuccess || availability.isPlaceholderData) return
    if (!rooms.some((candidate) => candidate.id === roomId)) roomField.onChange(null)
  }, [roomId, rooms, availability.isSuccess, availability.isPlaceholderData, roomField])

  const submit = handleSubmit((payload) => {
    createReservation.mutate(payload, {
      onError: (error) => {
        const conflict = roomUnavailableInfo(error)
        if (conflict) {
          const when =
            conflict.conflictingCheckinDate === null
              ? ''
              : ` Conflito com uma reserva a partir de ${formatISODate(conflict.conflictingCheckinDate)}.`
          setError('root.server', { type: 'server', message: `${errorMessage(error)}${when}` })
          // A lista vista já não vale: o quarto acabou de ser tomado.
          invalidateServerState()
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

      <Typography as="p" variant="body" tone="muted">
        Hóspede:{' '}
        <Typography as="strong" variant="body">
          {guest.full_name}
        </Typography>
      </Typography>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Entrada" error={errors.checkin_date?.message}>
          {(control) => (
            <Input type="date" min={today} {...control} {...register('checkin_date')} />
          )}
        </FormField>
        <FormField label="Saída" error={errors.checkout_date?.message}>
          {(control) => (
            <Input
              type="date"
              min={addDaysISO(checkinDate || today, 1)}
              {...control}
              {...register('checkout_date')}
            />
          )}
        </FormField>
      </div>

      <CompanionPicker
        holderId={guest.id}
        value={companions}
        error={errors.companion_ids?.message}
        onChange={(next) => {
          setCompanions(next)
          companionIds.field.onChange(next.map((companion) => companion.id))
        }}
      />

      <FormField
        label="Quarto"
        hint={roomHint()}
        error={
          errors.room_id?.message ??
          (availability.isError ? errorMessage(availability.error) : undefined)
        }
      >
        {(selectControl) => (
          <Select
            items={roomItems}
            value={roomId}
            disabled={!datesValid || availability.isPending}
            onValueChange={(value) => roomField.onChange(value)}
          >
            <SelectTrigger {...selectControl} onBlur={roomField.onBlur} className="w-full">
              <SelectValue placeholder="Selecione um quarto" />
            </SelectTrigger>
            <SelectContent>
              {roomItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <Controller
        control={control}
        name="has_vehicle"
        render={({ field }) => (
          <Field data-invalid={errors.has_vehicle ? true : undefined}>
            <FieldLabel htmlFor="has_vehicle" className="flex-row items-center">
              <Checkbox
                id="has_vehicle"
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked)}
                onBlur={field.onBlur}
                aria-invalid={errors.has_vehicle ? true : undefined}
              />
              Utilizará vaga de estacionamento
            </FieldLabel>
            {errors.has_vehicle?.message ? (
              <FieldError>{errors.has_vehicle.message}</FieldError>
            ) : null}
          </Field>
        )}
      />

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={createReservation.isPending}>
          {createReservation.isPending ? 'Criando…' : 'Criar reserva'}
        </Button>
      </div>
    </form>
  )

  function roomHint(): string | undefined {
    if (!datesValid) return 'Informe entrada e saída válidas para ver os quartos livres.'
    if (availability.isPending) return 'Buscando quartos livres…'
    if (availability.isSuccess && rooms.length === 0) {
      return 'Nenhum quarto disponível para o período.'
    }
    return `${people === 1 ? '1 pessoa' : `${people} pessoas`} — só os quartos livres no período.`
  }
}
