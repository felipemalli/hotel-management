import { ConfirmDestructiveDialog } from '@/components/common'
import { useDeleteRoom } from '@/features/rooms/hooks'
import type { Room } from '@/features/rooms/types'

export interface RoomDeleteDialogProps {
  room: Room
  onClose: () => void
  onDeleted: (room: Room) => void
}

export function RoomDeleteDialog({ room, onClose, onDeleted }: RoomDeleteDialogProps) {
  const deleteRoom = useDeleteRoom({ onSuccess: () => onDeleted(room) })

  return (
    <ConfirmDestructiveDialog
      title="Excluir quarto"
      description={`O quarto ${room.number} some do inventário. Um quarto com histórico de reserva não pode ser excluído — desative-o para tirá-lo de operação.`}
      pending={deleteRoom.isPending}
      confirmLabel="Excluir"
      pendingLabel="Excluindo…"
      onClose={onClose}
      onConfirm={() => {
        deleteRoom.mutate(room.id)
      }}
    />
  )
}
