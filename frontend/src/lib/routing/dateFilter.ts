import { isISODate } from '../format/dates'

export const TODAY = 'today'

/** `'today'` — resolvido no relógio do hotel — ou uma data `YYYY-MM-DD`. */
export type DateFilter = string | null

// Valor inválido cai no padrão: ?entrada=NOPE não merece tela de erro.
export function parseDateFilter(raw: string | null): DateFilter {
  if (raw === TODAY) return TODAY
  return raw !== null && isISODate(raw) ? raw : null
}

export function resolveDateFilter(value: DateFilter, today: string): string | null {
  if (value === null) return null
  return value === TODAY ? today : value
}
