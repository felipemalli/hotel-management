import type { SortDirection } from '@/components/common'
import { type DateFilter, parseDateFilter, resolveDateFilter } from '@/lib/routing/dateFilter'
import { PAGE_PARAM, pageFromSearchParams, withPage } from '@/lib/routing/pagination'

import { reservationOrderingSchema, reservationStatusSchema } from './schemas'
import type {
  ReservationListParams,
  ReservationOrdering,
  ReservationSortField,
  ReservationStatus,
} from './types'

export const STATUS_PARAM = 'status'
export const PAID_PARAM = 'paid'
export const SEARCH_PARAM = 'q'
export const CHECKIN_PARAM = 'checkin'
export const CHECKOUT_PARAM = 'checkout'
export const ORDERING_PARAM = 'ordering'

export interface ReservationFilters {
  status: ReservationStatus | null
  paid: boolean | null
  search: string
  checkinDate: DateFilter
  checkoutDate: DateFilter
  ordering: ReservationOrdering | null
  page: number
}

export const DEFAULT_FILTERS: ReservationFilters = {
  status: null,
  paid: null,
  search: '',
  checkinDate: null,
  checkoutDate: null,
  ordering: null,
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

  const ordering = reservationOrderingSchema.safeParse(params.get(ORDERING_PARAM))

  return {
    status: statusValue,
    paid,
    search: params.get(SEARCH_PARAM) ?? '',
    checkinDate: parseDateFilter(params.get(CHECKIN_PARAM)),
    checkoutDate: parseDateFilter(params.get(CHECKOUT_PARAM)),
    ordering: ordering.success ? ordering.data : null,
    page: pageFromSearchParams(params),
  }
}

export function toSearchParams(filters: ReservationFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.status !== null) params.set(STATUS_PARAM, filters.status)
  if (filters.paid !== null) params.set(PAID_PARAM, String(filters.paid))
  if (filters.checkinDate !== null) params.set(CHECKIN_PARAM, filters.checkinDate)
  if (filters.checkoutDate !== null) params.set(CHECKOUT_PARAM, filters.checkoutDate)
  if (filters.ordering !== null) params.set(ORDERING_PARAM, filters.ordering)
  if (filters.search.trim() !== '') params.set(SEARCH_PARAM, filters.search)
  return withPage(params, filters.page)
}

// `today` por parâmetro: 'hoje' fica na URL e só vira data na hora de consultar.
export function toListParams(filters: ReservationFilters, today: string): ReservationListParams {
  const checkinDate = resolveDateFilter(filters.checkinDate, today)
  const checkoutDate = resolveDateFilter(filters.checkoutDate, today)

  return {
    ...(filters.status === null ? {} : { status: filters.status }),
    ...(filters.paid === null ? {} : { paid: filters.paid }),
    ...(filters.search.trim() === '' ? {} : { search: filters.search.trim() }),
    ...(checkinDate === null ? {} : { checkin_date: checkinDate }),
    ...(checkoutDate === null ? {} : { checkout_date: checkoutDate }),
    ...(filters.ordering === null ? {} : { ordering: filters.ordering }),
    ...(filters.page > 1 ? { page: filters.page } : {}),
  }
}

export function sortDirectionOf(
  ordering: ReservationOrdering | null,
  field: ReservationSortField,
): SortDirection {
  if (ordering === field) return 'ascending'
  if (ordering === `-${field}`) return 'descending'
  return 'none'
}

export function nextOrdering(
  ordering: ReservationOrdering | null,
  field: ReservationSortField,
): ReservationOrdering | null {
  const direction = sortDirectionOf(ordering, field)
  if (direction === 'none') return field
  return direction === 'ascending' ? `-${field}` : null
}

// useParams é texto; "abc"/0 não viram requisição.
export function parseReservationId(raw: string | undefined): number | null {
  return raw !== undefined && /^[1-9]\d{0,8}$/.test(raw) ? Number.parseInt(raw, 10) : null
}

export { PAGE_PARAM }
