import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { FormField } from '@/components/common'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@/components/ui'
import { useUpdateRoom } from '@/features/rooms/hooks'
import { roomCapacitySchema } from '@/features/rooms/schemas'
import type { Room } from '@/features/rooms/types'
import { applyServerErrors } from '@/lib/forms/forms'
import { useDismissibleOpen } from '@/lib/hooks/useDismissibleOpen'

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
  const { open, setOpen, onOpenChange, onOpenChangeComplete } = useDismissibleOpen(onClose)

  const submit = handleSubmit((values) => {
    updateRoom.mutate(
      { id: room.id, patch: { capacity: values.capacity } },
      {
        onError: (error) => {
          applyServerErrors(error, setError, ['capacity'])
        },
      },
    )
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Editar capacidade — quarto ${room.number}`}</DialogTitle>
          <DialogDescription>
            Não pode ficar abaixo do maior grupo com reserva ativa neste quarto.
          </DialogDescription>
        </DialogHeader>
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
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={updateRoom.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={updateRoom.isPending}>
              {updateRoom.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
