import { PAGE_PARAM, pageFromSearchParams, withPage } from '@/lib/routing/pagination'

import { reservationStatusSchema } from './schemas'
import type { ReservationListParams, ReservationStatus } from './types'

export const STATUS_PARAM = 'status'
export const PAID_PARAM = 'paid'
export const SEARCH_PARAM = 'q'

export interface ReservationFilters {
  status: ReservationStatus | null
  paid: boolean | null
  search: string
  page: number
}

export const DEFAULT_FILTERS: ReservationFilters = {
  status: null,
  paid: null,
  search: '',
  page: 1,
}

// Valor inválido cai no padrão: ?status=NOPE não merece tela de erro.
export function parseReservationFilters(params: URLSearchParams): ReservationFilters {
  const status = reservationStatusSchema.safeParse(params.get(STATUS_PARAM))
  const statusValue = status.success ? status.data : null

  // paid só em conta fechada: no servidor paid=false casa também PENDING/CHECKED_IN/CANCELLED.
  const rawPaid = params.get(PAID_PARAM)
  const paid =
    statusValue === 'CHECKED_OUT' && (rawPaid === 'true' || rawPaid === 'false')
      ? rawPaid === 'true'
      : null

  return {
    status: statusValue,
    paid,
    search: params.get(SEARCH_PARAM) ?? '',
    page: pageFromSearchParams(params),
  }
}

export function toSearchParams(filters: ReservationFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.status !== null) params.set(STATUS_PARAM, filters.status)
  if (filters.paid !== null) params.set(PAID_PARAM, String(filters.paid))
  if (filters.search.trim() !== '') params.set(SEARCH_PARAM, filters.search)
  return withPage(params, filters.page)
}

export function toListParams(filters: ReservationFilters): ReservationListParams {
  return {
    ...(filters.status === null ? {} : { status: filters.status }),
    ...(filters.paid === null ? {} : { paid: filters.paid }),
    ...(filters.search.trim() === '' ? {} : { search: filters.search.trim() }),
    ...(filters.page > 1 ? { page: filters.page } : {}),
  }
}

// useParams é texto; "abc"/0 não viram requisição.
export function parseReservationId(raw: string | undefined): number | null {
  return raw !== undefined && /^[1-9]\d{0,8}$/.test(raw) ? Number.parseInt(raw, 10) : null
}

export { PAGE_PARAM }
