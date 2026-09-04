import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { useController, useForm } from 'react-hook-form'

import { Alert, Button, Checkbox, Input, Select } from '@/components/ui'
import type { GuestRef as GuestSummary } from '@/features/guests/types'
import { useAvailableRooms } from '@/features/rooms/hooks'
import { useInvalidateServerState } from '@/lib/api/useInvalidateServerState'
import { errorMessage, roomUnavailableInfo } from '@/lib/errors/errors'
import { addDaysISO, formatISODate, todayISO } from '@/lib/format/dates'
import { applyServerErrors } from '@/lib/forms/forms'

import { CompanionPicker } from './components/CompanionPicker'
import { useCreateReservation } from './hooks'
import { reservationFormSchema } from './schemas'
import type {
  CreateReservationPayload,
  GuestRef,
  Reservation,
  ReservationFormValues,
} from './types'

// `guest_id` não tem campo na tela: um erro do servidor sobre ele vai para o
// alerta do topo em vez de sumir num campo que o atendente não vê.
const FIELDS = ['checkin_date', 'checkout_date', 'has_vehicle', 'room_id', 'companion_ids'] as const

export interface ReservationFormProps {
  guest: GuestSummary
  onSuccess?: (reservation: Reservation) => void
  onCancel?: () => void
}

export function ReservationForm({ guest, onSuccess, onCancel }: ReservationFormProps) {
  // Hoje é lido uma vez na montagem: recomputar a cada render faria um
  // formulário aberto durante a virada do dia recusar a própria data padrão.
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
  // O formulário guarda só os ids, que é o que a API recebe; os nomes ficam
  // aqui para as etiquetas, reescritos junto a cada mudança.
  const [companions, setCompanions] = useState<GuestRef[]>([])

  const invalidateServerState = useInvalidateServerState()
  const createReservation = useCreateReservation({ onSuccess })

  const checkinDate = watch('checkin_date')
  const checkoutDate = watch('checkout_date')

  // Fora deste intervalo o servidor responderia 400 (saída ≤ entrada, ou D11):
  // o campo fica desabilitado em vez de disparar uma consulta por tecla.
  const datesValid = checkinDate >= today && checkoutDate > checkinDate
  const people = 1 + companionIds.field.value.length
  const availability = useAvailableRooms(
    { checkin_date: checkinDate, checkout_date: checkoutDate, people },
    { enabled: datesValid },
  )

  // `useMemo` para a lista ser a mesma referência entre renders: ela é
  // dependência do efeito que limpa o quarto, e um array novo a cada passagem
  // faria o efeito rodar sem que nada tivesse mudado.
  const rooms = useMemo(() => availability.data?.results ?? [], [availability.data])
  const roomId = room.field.value
  const roomField = room.field

  // Um quarto escolhido para outras datas ou menos pessoas pode ter saído da
  // lista: a escolha volta ao vazio em vez de seguir para um 409 certo. Só com
  // dado fresco — o da consulta anterior ainda não decide nada.
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
          // A lista que o atendente viu já não vale: o quarto acabou de ser
          // tomado por outra reserva.
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

      <CompanionPicker
        holderId={guest.id}
        value={companions}
        error={errors.companion_ids?.message}
        onChange={(next) => {
          setCompanions(next)
          companionIds.field.onChange(next.map((companion) => companion.id))
        }}
      />

      <Select
        label="Quarto"
        name={roomField.name}
        ref={roomField.ref}
        onBlur={roomField.onBlur}
        value={roomId ?? ''}
        disabled={!datesValid || availability.isPending}
        hint={roomHint()}
        error={
          errors.room_id?.message ??
          (availability.isError ? errorMessage(availability.error) : undefined)
        }
        onChange={(event) => {
          // O id volta do próprio objeto da lista: nada de converter o texto da
          // opção de volta para número.
          const chosen = rooms.find((candidate) => String(candidate.id) === event.target.value)
          roomField.onChange(chosen?.id ?? null)
        }}
      >
        <option value="">Selecione um quarto</option>
        {rooms.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {`${candidate.number} · capacidade ${candidate.capacity}`}
          </option>
        ))}
      </Select>

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

  function roomHint(): string | undefined {
    if (!datesValid) return 'Informe entrada e saída válidas para ver os quartos livres.'
    if (availability.isPending) return 'Buscando quartos livres…'
    if (availability.isSuccess && rooms.length === 0) {
      return 'Nenhum quarto disponível para o período.'
    }
    return `${people === 1 ? '1 pessoa' : `${people} pessoas`} — só os quartos livres no período.`
  }
}
