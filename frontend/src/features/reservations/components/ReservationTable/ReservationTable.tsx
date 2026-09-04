import { DataTable } from '@/components/common'
import type { Reservation } from '@/features/reservations/types'

import { reservationColumns } from './columns'

export interface ReservationTableProps {
  reservations: readonly Reservation[]
  isLoading?: boolean
}

export function ReservationTable({ reservations, isLoading = false }: ReservationTableProps) {
  return (
    <DataTable
      columns={reservationColumns}
      data={reservations}
      caption="Reservas"
      getRowId={(reservation) => `reservation-${reservation.id}`}
      isLoading={isLoading}
      emptyMessage="Nenhuma reserva encontrada"
    />
  )
}
