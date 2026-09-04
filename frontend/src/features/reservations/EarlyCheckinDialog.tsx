import { Button, Dialog } from '@/components/ui'

export interface EarlyCheckinDialogProps {
  open: boolean
  serverTime: string
  // Vem da política vigente, não de uma constante: um admin publica outra
  // abertura e o texto tem de acompanhar.
  opensAt: string
  guestName: string
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function EarlyCheckinDialog({
  open,
  serverTime,
  opensAt,
  guestName,
  pending = false,
  onConfirm,
  onCancel,
}: EarlyCheckinDialogProps) {
  return (
    <Dialog
      open={open}
      role="alertdialog"
      size="sm"
      title={`Check-in antes das ${opensAt}`}
      description={`São ${serverTime} — o check-in abre às ${opensAt}. Confirmar mesmo assim?`}
      onClose={onCancel}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? 'Confirmando…' : 'Confirmar mesmo assim'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        O check-in de <strong className="text-slate-900">{guestName}</strong> será registrado fora
        do horário de abertura.
      </p>
    </Dialog>
  )
}
