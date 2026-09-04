import { FormField } from '@/components/common'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import type { ReservationFilters as Filters } from '@/features/reservations/filters'
import { reservationStatusSchema } from '@/features/reservations/schemas'
import { RESERVATION_STATUS_LABELS } from '@/features/reservations/status'
import type { ReservationStatus } from '@/features/reservations/types'

const STATUS_ITEMS: readonly { value: ReservationStatus | null; label: string }[] = [
  { value: null, label: 'Todos' },
  ...reservationStatusSchema.options.map((status) => ({
    value: status,
    label: RESERVATION_STATUS_LABELS[status],
  })),
]

const PAID_ITEMS: readonly { value: boolean | null; label: string }[] = [
  { value: null, label: 'Todas' },
  { value: true, label: 'Pagas' },
  { value: false, label: 'Em aberto' },
]

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
        <FormField label="Status">
          {(control) => (
            <Select items={STATUS_ITEMS} value={filters.status} onValueChange={onStatusChange}>
              <SelectTrigger {...control} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ITEMS.map((item) => (
                  <SelectItem key={item.label} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>

      {/* Só em CHECKED_OUT: antes do checkout o filtro de pagamento mentiria. */}
      {filters.status === 'CHECKED_OUT' ? (
        <div className="w-full sm:w-56">
          <FormField label="Pagamento">
            {(control) => (
              <Select items={PAID_ITEMS} value={filters.paid} onValueChange={onPaidChange}>
                <SelectTrigger {...control} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAID_ITEMS.map((item) => (
                    <SelectItem key={item.label} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>
      ) : null}
    </div>
  )
}
