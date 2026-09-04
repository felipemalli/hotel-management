import { useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui'
import { useUpdateRoom } from '@/features/rooms/hooks'
import type { Room } from '@/features/rooms/types'
import { focusMainContent } from '@/lib/a11y/focus'

export interface RoomDeactivateDialogProps {
  room: Room
  onClose: () => void
  onDeactivated: (room: Room) => void
}

export function RoomDeactivateDialog({ room, onClose, onDeactivated }: RoomDeactivateDialogProps) {
  const updateRoom = useUpdateRoom({ onSuccess: onDeactivated })
  // open=false antes de desmontar: o Base UI restaura o foco nessa transição.
  const [open, setOpen] = useState(true)
  // Só a confirmação usa finalFocus: a linha pode desmontar com o quarto.
  const [confirmed, setConfirmed] = useState(false)

  return (
    <AlertDialog
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(next) => (next ? undefined : onClose())}
    >
      <AlertDialogContent
        size="sm"
        finalFocus={confirmed ? () => focusMainContent() ?? true : undefined}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Desativar quarto</AlertDialogTitle>
          <AlertDialogDescription>
            O quarto {room.number} deixa de ser oferecido a novas reservas. Um quarto com reserva
            ativa não pode ser desativado.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={updateRoom.isPending}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={updateRoom.isPending}
            onClick={() => {
              setConfirmed(true)
              // 409 do quarto ocupado fica no toast; o diálogo segue aberto.
              updateRoom.mutate({ id: room.id, patch: { is_active: false } })
            }}
          >
            {updateRoom.isPending ? 'Desativando…' : 'Desativar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
