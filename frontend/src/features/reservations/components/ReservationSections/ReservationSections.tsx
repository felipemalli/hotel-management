import type { UseQueryResult } from '@tanstack/react-query'

import { DescriptionList, ErrorState } from '@/components/common'
import { Typography } from '@/components/ui'
import type { Guest } from '@/features/guests/types'
import { describeEntry, historyEntries } from '@/features/reservations/history'
import { PAYMENT_METHOD_LABELS } from '@/features/reservations/status'
import type { Reservation } from '@/features/reservations/types'
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
      className="flex flex-col gap-3 rounded-lg bg-white p-5 ring-1 ring-slate-200"
    >
      <Typography as="h3" id={id} variant="cardTitle">
        {title}
      </Typography>
      {children}
    </section>
  )
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
      <div className="flex flex-col gap-1">
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
          <Typography as="p" variant="body">
            {guest.data.full_name}{' '}
            <Typography as="span" variant="mono" tone="muted">
              {formatDocument(guest.data.document)} · {formatPhone(guest.data.phone)} ·{' '}
              <span title={countryName(guest.data.nationality)}>{guest.data.nationality}</span>
            </Typography>
          </Typography>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Typography as="p" variant="overline">
          Acompanhantes
        </Typography>
        {reservation.companions.length === 0 ? (
          <Typography as="p" variant="body" tone="muted">
            Sem acompanhantes
          </Typography>
        ) : (
          <ul className="flex flex-col gap-0.5 text-sm text-slate-900">
            {reservation.companions.map((companion) => (
              <li key={companion.id}>{companion.full_name}</li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

export function ReservationHistorySection({ reservation }: { reservation: Reservation }) {
  return (
    <Section title="Histórico">
      <ol className="flex flex-col gap-1 text-sm text-slate-700">
        {historyEntries(reservation).map((entry) => (
          <li key={entry.label}>{describeEntry(entry)}</li>
        ))}
      </ol>
    </Section>
  )
}

export function ReservationAccountSection({ reservation }: { reservation: Reservation }) {
  // Os três campos do pagamento são nulos juntos; ler o método estreita o tipo.
  const method = reservation.payment_method

  return (
    <Section title="Conta">
      <DescriptionList
        items={[
          { label: 'Diárias', value: money(reservation.total_daily) },
          { label: 'Vaga', value: money(reservation.total_parking) },
          {
            // Base da multa, não o fator: o extrato congelado não carrega o fator.
            label: 'Multa de checkout tardio',
            value:
              reservation.late_fee_base === null
                ? '—'
                : `${money(reservation.late_fee)} (base ${money(reservation.late_fee_base)})`,
          },
          {
            label: 'Total',
            value: (
              <Typography as="strong" variant="body" className="text-base">
                {money(reservation.total_amount)}
              </Typography>
            ),
          },
          {
            label: 'Pagamento',
            value:
              method === null
                ? 'Em aberto'
                : `${PAYMENT_METHOD_LABELS[method]} · por ${reservation.paid_by?.username ?? 'sistema'}`,
          },
        ]}
      />
    </Section>
  )
}
