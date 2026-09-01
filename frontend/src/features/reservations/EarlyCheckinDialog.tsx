import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'

/**
 * F2 (SPEC 5.3) — alerta de check-in antes das 14h.
 *
 * **Este componente e o "alerta" da RN4.** O briefing manda permitir o
 * check-in e emitir um alerta; a API responde `409 EARLY_CHECKIN` com
 * `extra.server_time` (D4) e quem decide e o atendente: confirmar reenvia com
 * `allow_early: true`, cancelar nao produz efeito nenhum.
 *
 * `alertdialog` e nao `dialog`: exige decisao antes de seguir.
 */

export interface EarlyCheckinDialogProps {
  open: boolean
  /** `extra.server_time` do envelope 409, no formato "HH:MM". */
  serverTime: string
  guestName: string
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function EarlyCheckinDialog({
  open,
  serverTime,
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
      title="Check-in antes das 14:00"
      description={`São ${serverTime} — o check-in abre às 14:00. Confirmar mesmo assim?`}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? 'Confirmando…' : 'Confirmar mesmo assim'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        O check-in de <strong className="text-slate-900">{guestName}</strong> será registrado
        fora do horário de abertura.
      </p>
    </Dialog>
  )
}
