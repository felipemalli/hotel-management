import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { formatISODate, formatISODateTime } from '@/lib/dates'
import { formatBRL } from '@/lib/money'

import type { CheckoutStatement } from './types'

/**
 * F3 (SPEC 5.3) — extrato de checkout, o requisito de exibicao da RN6.
 *
 * Uma linha por diaria (data, dia da semana, diaria, vaga), os subtotais, a
 * linha de multa **somente se** `late_fee.applied` (D3) e o total em destaque.
 *
 * Todo valor passa por `formatBRL`: string in, string out. Nenhuma soma,
 * nenhuma conversao numerica — os totais exibidos sao os que a API mandou
 * (SPEC 0.3). Se um subtotal parecer errado, o bug e do backend, nao daqui.
 */

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
