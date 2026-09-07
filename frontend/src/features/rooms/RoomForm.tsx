import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { Alert, FormField } from '@/components/common'
import { Button, Input } from '@/components/ui'
import { applyServerErrors } from '@/lib/forms/forms'

import { useCreateRoom } from './hooks'
import { roomFormSchema } from './schemas'
import type { CreateRoomPayload, Room } from './types'

const FIELDS = ['number', 'capacity'] as const

export interface RoomFormProps {
  onSuccess?: (room: Room) => void
  onCancel?: () => void
}

export function RoomForm({ onSuccess, onCancel }: RoomFormProps) {
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<CreateRoomPayload>({
    resolver: zodResolver(roomFormSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    // Default 2: NaN de partida renderizaria "NaN".
    defaultValues: { number: '', capacity: 2 },
  })

  const createRoom = useCreateRoom({
    onSuccess: (room) => {
      reset()
      onSuccess?.(room)
    },
  })

  const submit = handleSubmit((payload) => {
    createRoom.mutate(payload, {
      onError: (error) => {
        // 403 vai ao toast global: este formulário só existe para o admin.
        applyServerErrors(error, setError, FIELDS)
      },
    })
  })

  const rootError = errors.root?.server?.message

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      {rootError ? <Alert tone="error">{rootError}</Alert> : null}

      <FormField
        label="Número"
        hint="Até 10 caracteres — “101”, “12A”."
        error={errors.number?.message}
      >
        {(control) => (
          <Input autoComplete="off" placeholder="101" {...control} {...register('number')} />
        )}
      </FormField>
      <FormField
        label="Capacidade"
        hint="Pessoas por quarto (titular + acompanhantes)."
        error={errors.capacity?.message}
      >
        {(control) => (
          <Input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            {...control}
            {...register('capacity', { valueAsNumber: true })}
          />
        )}
      </FormField>

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={createRoom.isPending}>
          {createRoom.isPending ? 'Cadastrando…' : 'Cadastrar quarto'}
        </Button>
      </div>
    </form>
  )
}
