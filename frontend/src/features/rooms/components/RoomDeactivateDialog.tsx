import { Button, Dialog } from '@/components/ui'

import { useUpdateRoom } from '../hooks'
import type { Room } from '../types'

export interface RoomDeactivateDialogProps {
  room: Room
  onClose: () => void
  onDeactivated: (room: Room) => void
}

export function RoomDeactivateDialog({ room, onClose, onDeactivated }: RoomDeactivateDialogProps) {
  const updateRoom = useUpdateRoom({ onSuccess: onDeactivated })

  return (
    <Dialog
      open
      role="alertdialog"
      size="sm"
      title="Desativar quarto"
      description={`O quarto ${room.number} deixa de ser oferecido a novas reservas. Um quarto com reserva ativa não pode ser desativado.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={updateRoom.isPending}>
            Voltar
          </Button>
          <Button
            variant="danger"
            disabled={updateRoom.isPending}
            onClick={() => {
              // O 409 do quarto ocupado fica com o toast global, e o diálogo
              // segue aberto: a recusa é do servidor, não do preenchimento.
              updateRoom.mutate({ id: room.id, patch: { is_active: false } })
            }}
          >
            {updateRoom.isPending ? 'Desativando…' : 'Desativar'}
          </Button>
        </>
      }
    />
  )
}
