import { Link } from 'react-router-dom'

import { Table, TBody, TD, TH, THead, TR } from '@/components/ui'
import { formatISODate } from '@/lib/format/dates'
import { formatBRL } from '@/lib/format/money'
import { ROUTES } from '@/lib/routing/routes'

import { ReservationStatusBadge } from './components/ReservationStatusBadge'
import { paymentLabel, peopleCount } from './status'
import type { Reservation } from './types'

const HEADERS = [
  'Reserva',
  'Quarto',
  'Estadia',
  'Status',
  'Pessoas',
  'Vaga',
  'Total',
  'Pagamento',
  'Ações',
]

export interface ReservationTableProps {
  reservations: readonly Reservation[]
}

export function ReservationTable({ reservations }: ReservationTableProps) {
  return (
    <Table caption="Reservas">
      <THead>
        <TR>
          {HEADERS.map((header) => (
            <TH key={header}>{header}</TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {reservations.map((reservation) => (
          <TR key={reservation.id}>
            <TD className="font-medium text-slate-900">#{reservation.id}</TD>
            <TD className="font-mono text-xs">{reservation.room.number}</TD>
            <TD className="text-xs">
              <span className="whitespace-nowrap">
                {formatISODate(reservation.checkin_date)} →{' '}
                {formatISODate(reservation.checkout_date)}
              </span>
            </TD>
            <TD>
              <ReservationStatusBadge status={reservation.status} />
            </TD>
            <TD>{peopleCount(reservation)}</TD>
            <TD>{reservation.has_vehicle ? 'Sim' : 'Não'}</TD>
            {/* O total só existe depois do checkout: até lá não há conta. */}
            <TD className="whitespace-nowrap">
              {reservation.total_amount === null ? '—' : formatBRL(reservation.total_amount)}
            </TD>
            <TD>{paymentLabel(reservation)}</TD>
            <TD>
              <Link
                to={ROUTES.reservation(reservation.id)}
                className="text-sm font-medium text-slate-900 underline"
              >
                Detalhes
                <span className="sr-only"> da reserva #{reservation.id}</span>
              </Link>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  )
}
