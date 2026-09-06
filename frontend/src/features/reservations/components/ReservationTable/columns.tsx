import { createColumnHelper } from '@tanstack/react-table'
import { ChevronRightIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { type DataTableColumns, type dataTableFeatures } from '@/components/common'
import { buttonVariants, Typography } from '@/components/ui'
import { ReservationStatusBadge } from '@/features/reservations/components/ReservationStatusBadge'
import { paymentLabel, peopleCount } from '@/features/reservations/status'
import type { Reservation } from '@/features/reservations/types'
import { formatISODate } from '@/lib/format/dates'
import { formatBRL } from '@/lib/format/money'
import { ROUTES } from '@/lib/routing/routes'
import { cn } from '@/lib/utils'

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
      <Typography
        as="span"
        variant="mono"
        weight="medium"
        className="rounded-md border border-border bg-muted px-1.5 py-0.5"
      >
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
  helper.display({
    id: 'total',
    header: 'Total',
    cell: ({ row }) => {
      const total = row.original.account?.total_amount ?? null
      return (
        <Typography
          as="span"
          variant="mono"
          weight="medium"
          tone={total === null ? 'muted' : 'default'}
          className="whitespace-nowrap"
        >
          {total === null ? '—' : formatBRL(total)}
        </Typography>
      )
    },
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
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1')}
      >
        Detalhes
        <ChevronRightIcon className="size-3.5 opacity-60" aria-hidden="true" />
        <span className="sr-only"> da reserva #{row.original.id}</span>
      </Link>
    ),
  }),
])
