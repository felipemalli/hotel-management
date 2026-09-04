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
  // Fechar precisa passar por `open=false` antes de desmontar: é nessa
  // transição que o Base UI restaura o foco. Desmontar direto no pedido de
  // fechamento atropela essa restauração.
  const [open, setOpen] = useState(true)
  // "Voltar"/Escape devolvem o foco ao próprio gatilho (padrão do Base UI,
  // que segue vivo). Só a confirmação precisa de `finalFocus`: a linha pode
  // desmontar junto com o quarto desativado.
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
              // O 409 do quarto ocupado fica com o toast global, e o diálogo
              // segue aberto: a recusa é do servidor, não do preenchimento.
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
