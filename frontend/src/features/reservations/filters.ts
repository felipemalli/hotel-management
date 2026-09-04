import { PAGE_PARAM, pageFromSearchParams, withPage } from '@/lib/routing/pagination'

import { reservationStatusSchema } from './schemas'
import type { ReservationListParams, ReservationStatus } from './types'

export const STATUS_PARAM = 'status'
export const PAID_PARAM = 'paid'

export interface ReservationFilters {
  status: ReservationStatus | null
  paid: boolean | null
  page: number
}

export const DEFAULT_FILTERS: ReservationFilters = { status: null, paid: null, page: 1 }

// A URL é a fonte: recarregar, compartilhar e voltar preservam a consulta.
// Valor inválido cai no padrão em silêncio — um `?status=NOPE` digitado à mão
// não merece uma tela de erro.
export function parseReservationFilters(params: URLSearchParams): ReservationFilters {
  const status = reservationStatusSchema.safeParse(params.get(STATUS_PARAM))
  const statusValue = status.success ? status.data : null

  // `paid` só faz sentido sobre conta fechada: no servidor `paid=false` casa
  // também toda PENDING, CHECKED_IN e CANCELLED, e o filtro mentiria.
  const rawPaid = params.get(PAID_PARAM)
  const paid =
    statusValue === 'CHECKED_OUT' && (rawPaid === 'true' || rawPaid === 'false')
      ? rawPaid === 'true'
      : null

  return { status: statusValue, paid, page: pageFromSearchParams(params) }
}

// Omite os padrões: `/reservas`, e não `/reservas?status=&paid=&page=1`.
export function toSearchParams(filters: ReservationFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.status !== null) params.set(STATUS_PARAM, filters.status)
  if (filters.paid !== null) params.set(PAID_PARAM, String(filters.paid))
  return withPage(params, filters.page)
}

export function toListParams(filters: ReservationFilters): ReservationListParams {
  return {
    ...(filters.status === null ? {} : { status: filters.status }),
    ...(filters.paid === null ? {} : { paid: filters.paid }),
    ...(filters.page > 1 ? { page: filters.page } : {}),
  }
}

// Id da rota: `useParams` devolve texto, e "abc" ou "0" não são reserva — não
// vale uma requisição para descobrir isso.
export function parseReservationId(raw: string | undefined): number | null {
  return raw !== undefined && /^[1-9]\d{0,8}$/.test(raw) ? Number.parseInt(raw, 10) : null
}

export { PAGE_PARAM }
