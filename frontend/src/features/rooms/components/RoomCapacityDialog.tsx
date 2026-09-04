import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { FormField } from '@/components/common'
import { Button, Dialog, Input } from '@/components/ui'
import { applyServerErrors } from '@/lib/forms/forms'

import { useUpdateRoom } from '../hooks'
import { roomCapacitySchema } from '../schemas'
import type { Room } from '../types'

interface CapacityForm {
  capacity: number
}

export interface RoomCapacityDialogProps {
  room: Room
  onClose: () => void
  onUpdated: (room: Room) => void
}

export function RoomCapacityDialog({ room, onClose, onUpdated }: RoomCapacityDialogProps) {
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<CapacityForm>({
    resolver: zodResolver(roomCapacitySchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { capacity: room.capacity },
  })

  const updateRoom = useUpdateRoom({ onSuccess: onUpdated })

  const submit = handleSubmit((values) => {
    updateRoom.mutate(
      { id: room.id, patch: { capacity: values.capacity } },
      {
        onError: (error) => {
          // O servidor recusa encolher abaixo do maior grupo com reserva ativa,
          // e diz o número no próprio campo.
          applyServerErrors(error, setError, ['capacity'])
        },
      },
    )
  })

  return (
    <Dialog
      open
      size="sm"
      title={`Editar capacidade — quarto ${room.number}`}
      description="Não pode ficar abaixo do maior grupo com reserva ativa neste quarto."
      onClose={onClose}
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <FormField label="Capacidade" error={errors.capacity?.message}>
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
          <Button variant="outline" onClick={onClose} disabled={updateRoom.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={updateRoom.isPending}>
            {updateRoom.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
