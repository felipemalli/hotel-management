import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import type { DateFilter } from '@/lib/routing/dateFilter'

import { parseReservationFilters, type ReservationFilters, toSearchParams } from './filters'
import type { ReservationOrdering, ReservationStatus } from './types'

export interface ReservationFiltersHandle {
  filters: ReservationFilters
  setStatus: (status: ReservationStatus | null) => void
  setPaid: (paid: boolean | null) => void
  setSearch: (search: string) => void
  setCheckinDate: (checkinDate: DateFilter) => void
  setCheckoutDate: (checkoutDate: DateFilter) => void
  setOrdering: (ordering: ReservationOrdering | null) => void
  setPage: (page: number) => void
}

export function useReservationFilters(): ReservationFiltersHandle {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => parseReservationFilters(params), [params])

  // O patch reparseia: sair de CHECKED_OUT invalida o filtro de pagamento.
  function update(patch: Partial<ReservationFilters>) {
    setParams(toSearchParams(parseReservationFilters(toSearchParams({ ...filters, ...patch }))))
  }

  return {
    filters,
    setStatus: (status) => update({ status, paid: null, page: 1 }),
    setPaid: (paid) => update({ paid, page: 1 }),
    setSearch: (search) => update({ search, page: 1 }),
    setCheckinDate: (checkinDate) => update({ checkinDate, page: 1 }),
    setCheckoutDate: (checkoutDate) => update({ checkoutDate, page: 1 }),
    setOrdering: (ordering) => update({ ordering, page: 1 }),
    setPage: (page) => update({ page }),
  }
}
