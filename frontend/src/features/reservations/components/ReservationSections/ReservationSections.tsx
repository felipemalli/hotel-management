import type { UseQueryResult } from '@tanstack/react-query'

import { DescriptionList, ErrorState } from '@/components/common'
import { Typography } from '@/components/ui'
import type { Guest } from '@/features/guests/types'
import { describeEntry, historyEntries } from '@/features/reservations/history'
import { PAYMENT_METHOD_LABELS } from '@/features/reservations/status'
import type { CheckoutStatement, Reservation } from '@/features/reservations/types'
import { errorMessage } from '@/lib/errors/errors'
import { countryName } from '@/lib/format/countries'
import { formatISODate } from '@/lib/format/dates'
import { formatBRL } from '@/lib/format/money'
import { formatDocument, formatPhone } from '@/lib/format/pii'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `secao-${title.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm"
    >
      <Typography as="h3" id={id} variant="cardTitle">
        {title}
      </Typography>
      {children}
    </section>
  )
}

function initialsOf(fullName: string): string {
  return fullName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
}

// Ausência é travessão, nunca R$ 0,00 (zero é valor cobrado).
function money(value: string | null): string {
  return value === null ? '—' : formatBRL(value)
}

export function ReservationStaySection({ reservation }: { reservation: Reservation }) {
  return (
    <Section title="Hospedagem">
      <DescriptionList
        items={[
          { label: 'Quarto', value: reservation.room.number },
          { label: 'Entrada', value: formatISODate(reservation.checkin_date) },
          { label: 'Saída', value: formatISODate(reservation.checkout_date) },
          { label: 'Vaga', value: reservation.has_vehicle ? 'Sim' : 'Não' },
          {
            label: 'Tarifa aplicada',
            value: reservation.policy_id === null ? '—' : `Política #${reservation.policy_id}`,
          },
        ]}
      />
    </Section>
  )
}

export function ReservationPeopleSection({
  reservation,
  guest,
}: {
  reservation: Reservation
  guest: UseQueryResult<Guest>
}) {
  return (
    <Section title="Pessoas">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-8 gap-y-4">
        <div className="flex flex-col gap-2">
          <Typography as="p" variant="overline">
            Titular
          </Typography>
          {guest.isPending ? (
            <Typography as="p" variant="body" tone="muted">
              Carregando…
            </Typography>
          ) : guest.isError ? (
            <ErrorState message={errorMessage(guest.error)} onRetry={() => void guest.refetch()} />
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 flex-none items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground">
                {initialsOf(guest.data.full_name)}
              </div>
              <div>
                <Typography as="p" variant="body" weight="medium">
                  {guest.data.full_name}
                </Typography>
                <Typography as="p" variant="mono" tone="muted">
                  {formatDocument(guest.data.document)} · {formatPhone(guest.data.phone)} ·{' '}
                  <span title={countryName(guest.data.nationality)}>{guest.data.nationality}</span>
                </Typography>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Typography as="p" variant="overline">
            Acompanhantes
          </Typography>
          {reservation.companions.length === 0 ? (
            <Typography as="p" variant="body" tone="muted">
              Sem acompanhantes
            </Typography>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {reservation.companions.map((companion) => (
                <Typography as="li" key={companion.id} variant="body">
                  {companion.full_name}
                </Typography>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  )
}

export function ReservationHistorySection({ reservation }: { reservation: Reservation }) {
  return (
    <Section title="Histórico">
      <ol className="flex flex-col gap-3">
        {historyEntries(reservation).map((entry) => (
          <li key={entry.label} className="flex items-baseline gap-2.5">
            <span
              aria-hidden="true"
              className="size-1.5 flex-none -translate-y-px rounded-full bg-muted-foreground/50"
            />
            <Typography as="span" variant="body">
              {describeEntry(entry)}
            </Typography>
          </li>
        ))}
      </ol>
    </Section>
  )
}

export function ReservationAccountSection({
  reservation,
  statement,
}: {
  reservation: Reservation
  statement?: CheckoutStatement
}) {
  const payment = reservation.account?.payment ?? null

  const lines = [
    { label: 'Diárias', value: money(statement?.subtotal_daily ?? null) },
    { label: 'Vaga', value: money(statement?.subtotal_parking ?? null) },
    {
      // Base da multa, não o fator: o extrato não carrega o fator.
      label: 'Multa de checkout tardio',
      value: !statement?.late_fee.applied
        ? '—'
        : `${money(statement.late_fee.amount)} (base ${money(statement.late_fee.base_rate)})`,
    },
  ]
  const paymentLine =
    payment === null
      ? 'Em aberto'
      : `${PAYMENT_METHOD_LABELS[payment.method]} · por ${payment.received_by.username}`

  return (
    <Section title="Conta">
      <dl className="flex flex-col gap-3">
        {lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-4">
            <Typography as="dt" variant="body" tone="muted">
              {line.label}
            </Typography>
            <Typography as="dd" variant="mono">
              {line.value}
            </Typography>
          </div>
        ))}
      </dl>

      <div className="-mx-6 -mb-6 flex flex-wrap items-baseline justify-between gap-4 border-t border-border bg-muted/40 px-6 py-4">
        <div>
          <Typography as="p" variant="body" weight="semibold">
            Total
          </Typography>
          <Typography as="p" variant="caption">
            {paymentLine}
          </Typography>
        </div>
        <Typography as="p" variant="mono" className="text-lg font-semibold">
          {money(reservation.account?.total_amount ?? null)}
        </Typography>
      </div>
    </Section>
  )
}
