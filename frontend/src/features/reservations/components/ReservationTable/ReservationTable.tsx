import { useMemo } from 'react'

import { DataTable, type PaginationProps } from '@/components/common'
import {
  type CheckoutAlert,
  checkoutAlert,
  type CheckoutClock,
} from '@/features/reservations/status'
import type { Reservation, ReservationOrdering } from '@/features/reservations/types'

import { reservationColumns } from './columns'

// Hover próprio: o da tabela apagaria o alerta.
const ALERT_ROW_CLASS: Record<CheckoutAlert, string> = {
  due: 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/20',
  overdue: 'bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20',
}

export interface ReservationTableProps {
  reservations: readonly Reservation[]
  isLoading?: boolean
  pagination?: PaginationProps
  ordering?: ReservationOrdering | null
  onOrderingChange?: (ordering: ReservationOrdering | null) => void
  // null enquanto a política vigente não chegou: sem limite não há alerta a dar.
  clock?: CheckoutClock | null
}

export function ReservationTable({
  reservations,
  isLoading = false,
  pagination,
  ordering = null,
  onOrderingChange,
  clock = null,
}: ReservationTableProps) {
  const columns = useMemo(
    () =>
      reservationColumns({
        ordering,
        onOrderingChange: (next) => onOrderingChange?.(next),
        alertOf: (reservation) => checkoutAlert(reservation, clock),
      }),
    [ordering, onOrderingChange, clock],
  )

  return (
    <DataTable
      columns={columns}
      data={reservations}
      caption="Reservas"
      getRowId={(reservation) => `reservation-${reservation.id}`}
      isLoading={isLoading}
      emptyMessage="Nenhuma reserva encontrada"
      pagination={pagination}
      rowProps={(reservation) => {
        const alert = checkoutAlert(reservation, clock)
        return alert === null ? undefined : { className: ALERT_ROW_CLASS[alert] }
      }}
    />
  )
}
