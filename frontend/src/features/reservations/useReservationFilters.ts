import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { parseReservationFilters, type ReservationFilters, toSearchParams } from './filters'
import type { ReservationStatus } from './types'

export interface ReservationFiltersHandle {
  filters: ReservationFilters
  setStatus: (status: ReservationStatus | null) => void
  setPaid: (paid: boolean | null) => void
  setPage: (page: number) => void
}

export function useReservationFilters(): ReservationFiltersHandle {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => parseReservationFilters(params), [params])

  // O patch volta a passar pelo parser: sair de `CHECKED_OUT` invalida o filtro
  // de pagamento, e é o parser que sabe disso — não cada chamador.
  function update(patch: Partial<ReservationFilters>) {
    setParams(toSearchParams(parseReservationFilters(toSearchParams({ ...filters, ...patch }))))
  }

  return {
    filters,
    setStatus: (status) => update({ status, paid: null, page: 1 }),
    setPaid: (paid) => update({ paid, page: 1 }),
    setPage: (page) => update({ page }),
  }
}
