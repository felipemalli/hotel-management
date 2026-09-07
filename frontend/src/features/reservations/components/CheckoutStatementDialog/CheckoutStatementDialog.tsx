import { createColumnHelper } from '@tanstack/react-table'
import { useState } from 'react'

import { Alert, DataTable, type dataTableFeatures, FormField } from '@/components/common'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Typography,
} from '@/components/ui'
import { usePayReservation, useReservationStatement } from '@/features/reservations/hooks'
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '@/features/reservations/payment'
import type { BillLine, CheckoutStatement, PaymentMethod } from '@/features/reservations/types'
import { errorMessage, isApiErrorCode } from '@/lib/errors/errors'
import { formatISODate, formatISODateTime } from '@/lib/format/dates'
import { formatBRL } from '@/lib/format/money'
import { useDismissibleOpen } from '@/lib/hooks/useDismissibleOpen'
import { cn } from '@/lib/utils'

const dailyLineHelper = createColumnHelper<typeof dataTableFeatures, BillLine>()

const dailyLineColumns = dailyLineHelper.columns([
  dailyLineHelper.accessor('date', {
    header: 'Data',
    cell: ({ getValue }) => <span className="whitespace-nowrap">{formatISODate(getValue())}</span>,
  }),
  dailyLineHelper.accessor('weekday', {
    header: 'Dia da semana',
    cell: ({ getValue }) => <span className="capitalize">{getValue()}</span>,
  }),
  dailyLineHelper.accessor('daily_rate', {
    header: 'Diária',
    meta: { align: 'end' },
    cell: ({ getValue }) => <span className="whitespace-nowrap">{formatBRL(getValue())}</span>,
  }),
  dailyLineHelper.accessor('parking_fee', {
    header: 'Vaga',
    meta: { align: 'end' },
    cell: ({ getValue }) => <span className="whitespace-nowrap">{formatBRL(getValue())}</span>,
  }),
])

export interface CheckoutStatementDialogProps {
  open: boolean
  statement: CheckoutStatement
  onClose: () => void
  // false = 2ª via: mostra o pagamento sem oferecer registrá-lo.
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
      className={cn(
        'flex items-baseline justify-between gap-4 py-1.5',
        emphasis && 'border-t border-slate-300 pt-3',
      )}
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
  open: openProp,
  statement,
  onClose,
  allowPayment = false,
}: CheckoutStatementDialogProps) {
  const { open, setOpen, onOpenChange, onOpenChangeComplete } = useDismissibleOpen(
    onClose,
    openProp,
  )
  const pay = usePayReservation()
  const [stale, setStale] = useState(false)
  const refreshed = useReservationStatement(statement.reservation_id, { enabled: stale })

  const shown = pay.data ?? refreshed.data ?? statement
  const { late_fee: lateFee, payment } = shown
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const paymentItems = PAYMENT_METHODS.map((option) => ({
    value: option,
    label: PAYMENT_METHOD_LABELS[option],
  }))

  function registerPayment() {
    if (method === null) return

    pay.mutate(
      { id: shown.reservation_id, payment_method: method },
      {
        onError: (error) => {
          // extra.paid_at: outro atendente pagou; busca a versão paga.
          if (isApiErrorCode(error, 'INVALID_STATUS') && typeof error.extra.paid_at === 'string') {
            setStale(true)
          }
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Extrato de checkout</DialogTitle>
          <DialogDescription>
            {`${shown.guest.full_name} · ${formatISODateTime(shown.checked_in_at)} → ${formatISODateTime(shown.checked_out_at)}`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <DataTable
            columns={dailyLineColumns}
            data={shown.lines}
            caption="Diárias cobradas"
            getRowId={(line) => line.date}
          />

          <div className="rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
            <SummaryRow label="Subtotal diárias" value={formatBRL(shown.subtotal_daily)} />
            <SummaryRow label="Subtotal vaga" value={formatBRL(shown.subtotal_parking)} />
            {lateFee.applied
              ? lateFee.days.map((day) => (
                  <SummaryRow
                    key={day.date}
                    label={`Multa de checkout tardio · ${day.weekday} (base ${formatBRL(day.base_rate)})`}
                    value={formatBRL(day.amount)}
                  />
                ))
              : null}
            <SummaryRow label="Total a pagar" value={formatBRL(shown.total)} emphasis />

            <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3">
              {payment ? (
                <Typography as="p" variant="body" className="flex flex-wrap items-center gap-2">
                  <Badge variant="success">Pago</Badge>
                  <span>
                    Pago em {formatISODateTime(payment.paid_at)} ·{' '}
                    {PAYMENT_METHOD_LABELS[payment.method]} · por {payment.received_by.username}
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
                      <FormField label="Forma de pagamento" htmlFor="payment-method">
                        {(selectControl) => (
                          <Select items={paymentItems} value={method} onValueChange={setMethod}>
                            <SelectTrigger {...selectControl} className="w-full">
                              <SelectValue placeholder="Selecione…" />
                            </SelectTrigger>
                            <SelectContent>
                              {paymentItems.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </FormField>
                      <Button onClick={registerPayment} disabled={method === null || pay.isPending}>
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
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
