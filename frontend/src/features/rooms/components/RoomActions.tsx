import { Button } from '@/components/ui'
import { notifySuccess } from '@/lib/notify/toast'

import { useUpdateRoom } from '../hooks'
import type { Room } from '../types'

export interface RoomActionsProps {
  room: Room
  onEditCapacity: (room: Room) => void
  onRequestDeactivate: (room: Room) => void
}

export function RoomActions({ room, onEditCapacity, onRequestDeactivate }: RoomActionsProps) {
  // Reativar acontece na própria linha: ela só está visível porque a listagem
  // inclui os desativados, e continua ali depois. Desativar tira a linha da
  // listagem padrão, então a confirmação vive na página.
  const reactivate = useUpdateRoom({
    onSuccess: (updated) => notifySuccess(`Quarto ${updated.number} reativado.`),
  })

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => onEditCapacity(room)}>
        Editar capacidade
      </Button>
      {room.is_active ? (
        <Button size="sm" variant="danger" onClick={() => onRequestDeactivate(room)}>
          Desativar
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          disabled={reactivate.isPending}
          onClick={() => reactivate.mutate({ id: room.id, patch: { is_active: true } })}
        >
          {reactivate.isPending ? 'Reativando…' : 'Reativar'}
        </Button>
      )}
    </div>
  )
}
