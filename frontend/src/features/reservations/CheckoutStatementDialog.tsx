import { useState } from 'react'

import { Alert } from '@/components/common'
import {
  Badge,
  Button,
  Dialog,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Typography,
} from '@/components/ui'
import { errorMessage, isApiErrorCode } from '@/lib/errors/errors'
import { formatISODate, formatISODateTime } from '@/lib/format/dates'
import { formatBRL } from '@/lib/format/money'

import { usePayReservation, useReservationStatement } from './hooks'
import { isPaymentMethod, PAYMENT_METHODS } from './payment'
import { PAYMENT_METHOD_LABELS } from './status'
import type { CheckoutStatement, PaymentMethod } from './types'

export interface CheckoutStatementDialogProps {
  open: boolean
  statement: CheckoutStatement
  onClose: () => void
  // `false` é a 2ª via: mostra o estado do pagamento sem oferecer registrá-lo.
  allowPayment?: boolean
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
        emphasis ? 'border-t border-slate-300 pt-3' : '',
      ].join(' ')}
    >
      <Typography
        as="span"
        variant={emphasis ? 'sectionTitle' : 'body'}
        tone={emphasis ? 'default' : 'muted'}
      >
        {label}
      </Typography>
      <Typography as="span" variant={emphasis ? 'sectionTitle' : 'body'}>
        {value}
      </Typography>
    </div>
  )
}

export function CheckoutStatementDialog({
  open,
  statement,
  onClose,
  allowPayment = false,
}: CheckoutStatementDialogProps) {
  const pay = usePayReservation()
  const [stale, setStale] = useState(false)
  const refreshed = useReservationStatement(statement.reservation_id, { enabled: stale })

  // O extrato mais novo ganha: o da mutation (acabou de pagar), o da releitura
  // (outro atendente pagou antes) e, por fim, o que veio do checkout.
  const shown = pay.data ?? refreshed.data ?? statement
  const { late_fee: lateFee, payment } = shown
  const [method, setMethod] = useState<PaymentMethod | ''>('')

  function registerPayment() {
    if (method === '') return

    pay.mutate(
      { id: shown.reservation_id, payment_method: method },
      {
        onError: (error) => {
          // "Esta conta já foi paga.", com `extra.paid_at`: o extrato na tela é
          // que está velho. O toast global já disse o porquê; aqui se busca a
          // versão paga para a tela parar de oferecer o que não cabe mais.
          if (isApiErrorCode(error, 'INVALID_STATUS') && typeof error.extra.paid_at === 'string') {
            setStale(true)
          }
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      size="lg"
      title="Extrato de checkout"
      description={`${shown.guest.full_name} · ${formatISODateTime(shown.checked_in_at)} → ${formatISODateTime(shown.checked_out_at)}`}
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
            {shown.lines.map((line) => (
              <TR key={line.date}>
                <TD className="whitespace-nowrap">{formatISODate(line.date)}</TD>
                <TD className="capitalize">{line.weekday}</TD>
                <TD className="text-right whitespace-nowrap">{formatBRL(line.daily_rate)}</TD>
                <TD className="text-right whitespace-nowrap">{formatBRL(line.parking_fee)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>

        <div className="rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
          <SummaryRow label="Subtotal diárias" value={formatBRL(shown.subtotal_daily)} />
          <SummaryRow label="Subtotal vaga" value={formatBRL(shown.subtotal_parking)} />
          {/* O fator da multa é da política e o extrato não o carrega: mostrar
              "50%" aqui mentiria depois da primeira tarifa publicada. */}
          {lateFee.applied ? (
            <SummaryRow
              label={`Multa de checkout tardio (base ${formatBRL(lateFee.base_rate)})`}
              value={formatBRL(lateFee.amount)}
            />
          ) : null}
          <SummaryRow label="Total a pagar" value={formatBRL(shown.total)} emphasis />

          <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3">
            {payment ? (
              <Typography as="p" variant="body" className="flex flex-wrap items-center gap-2">
                <Badge variant="success">Pago</Badge>
                <span>
                  Pago em {formatISODateTime(payment.paid_at)} ·{' '}
                  {PAYMENT_METHOD_LABELS[payment.method]} · por {payment.paid_by.username}
                </span>
              </Typography>
            ) : (
              <>
                <Typography as="p" variant="body" className="flex flex-wrap items-center gap-2">
                  <Badge variant="warning">Em aberto</Badge>
                  <span>Pagamento ainda não registrado.</span>
                </Typography>
                {allowPayment ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <Select
                      label="Forma de pagamento"
                      value={method}
                      onChange={(event) => {
                        const chosen = event.target.value
                        setMethod(isPaymentMethod(chosen) ? chosen : '')
                      }}
                    >
                      <option value="">Selecione…</option>
                      {PAYMENT_METHODS.map((option) => (
                        <option key={option} value={option}>
                          {PAYMENT_METHOD_LABELS[option]}
                        </option>
                      ))}
                    </Select>
                    <Button onClick={registerPayment} disabled={method === '' || pay.isPending}>
                      {pay.isPending ? 'Registrando…' : 'Registrar pagamento'}
                    </Button>
                  </div>
                ) : null}
                {refreshed.isError ? (
                  <Alert tone="error">{errorMessage(refreshed.error)}</Alert>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
