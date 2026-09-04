import { Select } from '@/components/ui'

import type { ReservationFilters as Filters } from '../filters'
import { reservationStatusSchema } from '../schemas'
import { RESERVATION_STATUS_LABELS } from '../status'
import type { ReservationStatus } from '../types'

export interface ReservationFiltersProps {
  filters: Filters
  onStatusChange: (status: ReservationStatus | null) => void
  onPaidChange: (paid: boolean | null) => void
}

export function ReservationFilters({
  filters,
  onStatusChange,
  onPaidChange,
}: ReservationFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="w-full sm:w-56">
        <Select
          label="Status"
          value={filters.status ?? ''}
          onChange={(event) => {
            const parsed = reservationStatusSchema.safeParse(event.target.value)
            onStatusChange(parsed.success ? parsed.data : null)
          }}
        >
          <option value="">Todos</option>
          {reservationStatusSchema.options.map((status) => (
            <option key={status} value={status}>
              {RESERVATION_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </div>

      {/* Só sobre conta fechada: antes do checkout toda reserva está "em
          aberto" por definição, e o filtro diria uma coisa por outra. */}
      {filters.status === 'CHECKED_OUT' ? (
        <div className="w-full sm:w-56">
          <Select
            label="Pagamento"
            value={filters.paid === null ? '' : String(filters.paid)}
            onChange={(event) => {
              const chosen = event.target.value
              onPaidChange(chosen === 'true' ? true : chosen === 'false' ? false : null)
            }}
          >
            <option value="">Todas</option>
            <option value="true">Pagas</option>
            <option value="false">Em aberto</option>
          </Select>
        </div>
      ) : null}
    </div>
  )
}
