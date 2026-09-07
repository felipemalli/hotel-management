import { ConfirmDestructiveDialog } from '@/components/common'
import { useUpdateRoom } from '@/features/rooms/hooks'
import type { Room } from '@/features/rooms/types'

export interface RoomDeactivateDialogProps {
  room: Room
  onClose: () => void
  onDeactivated: (room: Room) => void
}

export function RoomDeactivateDialog({ room, onClose, onDeactivated }: RoomDeactivateDialogProps) {
  const updateRoom = useUpdateRoom({ onSuccess: onDeactivated })

  return (
    <ConfirmDestructiveDialog
      title="Desativar quarto"
      description={`O quarto ${room.number} deixa de ser oferecido a novas reservas. Um quarto com reserva ativa não pode ser desativado.`}
      pending={updateRoom.isPending}
      confirmLabel="Desativar"
      pendingLabel="Desativando…"
      onClose={onClose}
      onConfirm={() => {
        // 409 do quarto ocupado fica no toast; o diálogo segue aberto.
        updateRoom.mutate({ id: room.id, patch: { is_active: false } })
      }}
    />
  )
}
