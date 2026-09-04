import { createColumnHelper } from '@tanstack/react-table'
import { Link } from 'react-router-dom'

import { type DataTableColumns, type dataTableFeatures } from '@/components/common'
import { Typography } from '@/components/ui'
import { ReservationStatusBadge } from '@/features/reservations/components/ReservationStatusBadge'
import { paymentLabel, peopleCount } from '@/features/reservations/status'
import type { Reservation } from '@/features/reservations/types'
import { formatISODate } from '@/lib/format/dates'
import { formatBRL } from '@/lib/format/money'
import { ROUTES } from '@/lib/routing/routes'

const helper = createColumnHelper<typeof dataTableFeatures, Reservation>()

export const reservationColumns: DataTableColumns<Reservation> = helper.columns([
  helper.accessor('id', {
    header: 'Reserva',
    cell: ({ getValue }) => (
      <Typography as="span" variant="body" weight="medium">{`#${getValue()}`}</Typography>
    ),
  }),
  helper.accessor((row) => row.room.number, {
    id: 'room',
    header: 'Quarto',
    cell: ({ getValue }) => (
      <Typography as="span" variant="mono">
        {getValue()}
      </Typography>
    ),
  }),
  helper.display({
    id: 'stay',
    header: 'Estadia',
    cell: ({ row }) => (
      <Typography as="span" variant="caption" className="whitespace-nowrap">
        {formatISODate(row.original.checkin_date)} → {formatISODate(row.original.checkout_date)}
      </Typography>
    ),
  }),
  helper.display({
    id: 'status',
    header: 'Status',
    cell: ({ row }) => <ReservationStatusBadge status={row.original.status} />,
  }),
  helper.display({
    id: 'people',
    header: 'Pessoas',
    cell: ({ row }) => peopleCount(row.original),
  }),
  helper.display({
    id: 'vehicle',
    header: 'Vaga',
    cell: ({ row }) => (row.original.has_vehicle ? 'Sim' : 'Não'),
  }),
  // O total só existe depois do checkout: até lá não há conta.
  helper.display({
    id: 'total',
    header: 'Total',
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        {row.original.total_amount === null ? '—' : formatBRL(row.original.total_amount)}
      </span>
    ),
  }),
  helper.display({
    id: 'payment',
    header: 'Pagamento',
    cell: ({ row }) => paymentLabel(row.original),
  }),
  helper.display({
    id: 'actions',
    header: 'Ações',
    cell: ({ row }) => (
      <Link
        to={ROUTES.reservation(row.original.id)}
        className="text-sm font-medium text-foreground underline"
      >
        Detalhes
        <span className="sr-only"> da reserva #{row.original.id}</span>
      </Link>
    ),
  }),
])
