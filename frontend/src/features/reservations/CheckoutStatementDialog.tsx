import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { formatISODate, formatISODateTime } from '@/lib/dates'
import { formatBRL } from '@/lib/money'

import type { CheckoutStatement } from './types'

export interface CheckoutStatementDialogProps {
  open: boolean
  statement: CheckoutStatement
  onClose: () => void
}

function SummaryRow({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div
      className={[
        'flex items-baseline justify-between gap-4 py-1.5',
        emphasis ? 'border-t border-slate-300 pt-3 text-base font-semibold' : 'text-sm',
      ].join(' ')}
    >
      <span className={emphasis ? 'text-slate-900' : 'text-slate-600'}>{label}</span>
      <span className={emphasis ? 'text-slate-900' : 'text-slate-800'}>{value}</span>
    </div>
  )
}

export function CheckoutStatementDialog({
  open,
  statement,
  onClose,
}: CheckoutStatementDialogProps) {
  const { late_fee: lateFee } = statement

  return (
    <Dialog
      open={open}
      size="lg"
      title="Extrato de checkout"
      description={`${statement.guest.full_name} · ${formatISODateTime(statement.checked_in_at)} → ${formatISODateTime(statement.checked_out_at)}`}
      onClose={onClose}
      footer={<Button onClick={onClose}>Fechar</Button>}
    >
      <div className="flex flex-col gap-4">
        <Table caption="Diárias cobradas">
          <THead>
            <TR>
              <TH>Data</TH>
              <TH>Dia da semana</TH>
              <TH className="text-right">Diária</TH>
              <TH className="text-right">Vaga</TH>
            </TR>
          </THead>
          <TBody>
            {statement.lines.map((line) => (
              <tr key={line.date}>
                <TD className="whitespace-nowrap">{formatISODate(line.date)}</TD>
                <TD className="capitalize">{line.weekday}</TD>
                <TD className="text-right whitespace-nowrap">{formatBRL(line.daily_rate)}</TD>
                <TD className="text-right whitespace-nowrap">{formatBRL(line.parking_fee)}</TD>
              </tr>
            ))}
          </TBody>
        </Table>

        <div className="rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
          <SummaryRow label="Subtotal diárias" value={formatBRL(statement.subtotal_daily)} />
          <SummaryRow label="Subtotal vaga" value={formatBRL(statement.subtotal_parking)} />
          {lateFee.applied && lateFee.base_rate ? (
            <SummaryRow
              label={`Multa de checkout tardio (50% de ${formatBRL(lateFee.base_rate)})`}
              value={formatBRL(lateFee.amount)}
            />
          ) : null}
          <SummaryRow label="Total a pagar" value={formatBRL(statement.total)} emphasis />
        </div>
      </div>
    </Dialog>
  )
}
