import type { UseQueryResult } from '@tanstack/react-query'

import { DescriptionList, ErrorState } from '@/components/ui'
import type { Guest } from '@/features/guests/types'
import { countryName } from '@/lib/countries'
import { formatISODate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { formatBRL } from '@/lib/money'
import { formatDocument, formatPhone } from '@/lib/pii'

import { describeEntry, historyEntries } from '../history'
import { PAYMENT_METHOD_LABELS } from '../status'
import type { Reservation } from '../types'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `secao-${title.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3 rounded-lg bg-white p-5 ring-1 ring-slate-200"
    >
      <h3 id={id} className="text-sm font-semibold text-slate-900">
        {title}
      </h3>
      {children}
    </section>
  )
}

// Dinheiro que ainda não existe é travessão, nunca "R$ 0,00": zero é um valor
// cobrado, ausência é outra coisa.
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
            // A política é amarrada no check-in (D15): antes disso não há uma.
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
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Titular</p>
        {guest.isPending ? (
          <p className="text-sm text-slate-500">Carregando…</p>
        ) : guest.isError ? (
          <ErrorState message={errorMessage(guest.error)} onRetry={() => void guest.refetch()} />
        ) : (
          <p className="text-sm text-slate-900">
            {guest.data.full_name}{' '}
            <span className="font-mono text-xs text-slate-500">
              {formatDocument(guest.data.document)} · {formatPhone(guest.data.phone)} ·{' '}
              <span title={countryName(guest.data.nationality)}>{guest.data.nationality}</span>
            </span>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Acompanhantes
        </p>
        {reservation.companions.length === 0 ? (
          <p className="text-sm text-slate-500">Sem acompanhantes</p>
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
  // Os três campos do pagamento são nulos juntos ou preenchidos juntos
  // (constraint `resv_payment_complete`); ler o método é o que estreita o tipo.
  const method = reservation.payment_method

  return (
    <Section title="Conta">
      <DescriptionList
        items={[
          { label: 'Diárias', value: money(reservation.total_daily) },
          { label: 'Vaga', value: money(reservation.total_parking) },
          {
            // A base da multa, e não o fator: ele é da política, e o extrato
            // congelado não o carrega.
            label: 'Multa de checkout tardio',
            value:
              reservation.late_fee_base === null
                ? '—'
                : `${money(reservation.late_fee)} (base ${money(reservation.late_fee_base)})`,
          },
          {
            label: 'Total',
            value: <strong className="text-base">{money(reservation.total_amount)}</strong>,
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
