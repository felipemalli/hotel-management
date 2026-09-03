/**
 * Datas para exibicao. Mesma disciplina do dinheiro: manipulacao de string.
 *
 * `YYYY-MM-DD` NUNCA passa por `new Date()`: o construtor le a forma so-data
 * como UTC meia-noite e, em America/Sao_Paulo (UTC-3), volta um dia. Split
 * literal e imune a fuso.
 */

/** '2025-03-07' -> '07/03/2025' */
export function formatISODate(value: string): string {
  const [year, month, day] = value.split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

/** '2025-03-07T15:00:00-03:00' -> '07/03/2025 15:00' (offset da API, sem reconversao) */
export function formatISODateTime(value: string): string {
  const [datePart, timePart] = value.split('T')
  if (!datePart) return value
  const date = formatISODate(datePart)
  if (!timePart) return date
  return `${date} ${timePart.slice(0, 5)}`
}

/** Hoje em hora local, no formato do `<input type="date">` (D11: piso da reserva). */
export function todayISO(now: Date = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Soma dias sobre uma data ISO local, para o default do formulario. */
export function addDaysISO(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map((part) => Number.parseInt(part, 10))
  if (year === undefined || month === undefined || day === undefined) return isoDate
  const shifted = new Date(year, month - 1, day + days)
  return todayISO(shifted)
}
