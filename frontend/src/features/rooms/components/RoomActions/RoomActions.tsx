import { EllipsisIcon } from 'lucide-react'

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui'
import { useUpdateRoom } from '@/features/rooms/hooks'
import type { Room } from '@/features/rooms/types'
import { notifySuccess } from '@/lib/notify/toast'

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
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={`Ações do quarto ${room.number}`} />
        }
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => onEditCapacity(room)}>Editar capacidade</DropdownMenuItem>
        {room.is_active ? (
          <DropdownMenuItem variant="destructive" onClick={() => onRequestDeactivate(room)}>
            Desativar
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            disabled={reactivate.isPending}
            onClick={() => reactivate.mutate({ id: room.id, patch: { is_active: true } })}
          >
            {reactivate.isPending ? 'Reativando…' : 'Reativar'}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
