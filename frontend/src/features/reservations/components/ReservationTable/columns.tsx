import { createColumnHelper } from '@tanstack/react-table'
import { ChevronRightIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { type DataTableColumns, type dataTableFeatures, SortableHeader } from '@/components/common'
import { Badge, buttonVariants, Typography } from '@/components/ui'
import { ReservationStatusBadge } from '@/features/reservations/components/ReservationStatusBadge'
import { nextOrdering, sortDirectionOf } from '@/features/reservations/filters'
import {
  CHECKOUT_ALERT_LABELS,
  CHECKOUT_ALERT_TONES,
  type CheckoutAlert,
  paymentLabel,
  peopleCount,
} from '@/features/reservations/status'
import type {
  Reservation,
  ReservationOrdering,
  ReservationSortField,
} from '@/features/reservations/types'
import { formatISODate } from '@/lib/format/dates'
import { formatBRL } from '@/lib/format/money'
import { formatYesNo } from '@/lib/format/text'
import { ROUTES } from '@/lib/routing/routes'
import { cn } from '@/lib/utils'

const helper = createColumnHelper<typeof dataTableFeatures, Reservation>()

export interface ReservationColumnsOptions {
  ordering: ReservationOrdering | null
  onOrderingChange: (ordering: ReservationOrdering | null) => void
  alertOf: (reservation: Reservation) => CheckoutAlert | null
}

export function reservationColumns({
  ordering,
  onOrderingChange,
  alertOf,
}: ReservationColumnsOptions): DataTableColumns<Reservation> {
  function sortable(field: ReservationSortField, label: string) {
    const sort = sortDirectionOf(ordering, field)
    return {
      header: () => (
        <SortableHeader
          label={label}
          sort={sort}
          onToggle={() => onOrderingChange(nextOrdering(ordering, field))}
        />
      ),
      meta: { sort },
    }
  }

  return helper.columns([
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
    helper.accessor('checkin_date', {
      ...sortable('checkin_date', 'Entrada'),
      cell: ({ getValue }) => (
        <Typography as="span" variant="caption" className="whitespace-nowrap">
          {formatISODate(getValue())}
        </Typography>
      ),
    }),
    helper.accessor('checkout_date', {
      ...sortable('checkout_date', 'Saída'),
      cell: ({ row }) => {
        const alert = alertOf(row.original)
        return (
          <div className="flex items-center gap-2">
            <Typography as="span" variant="caption" className="whitespace-nowrap">
              {formatISODate(row.original.checkout_date)}
            </Typography>
            {alert === null ? null : (
              <Badge variant={CHECKOUT_ALERT_TONES[alert]}>{CHECKOUT_ALERT_LABELS[alert]}</Badge>
            )}
          </div>
        )
      },
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
      cell: ({ row }) => formatYesNo(row.original.has_vehicle),
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
}
