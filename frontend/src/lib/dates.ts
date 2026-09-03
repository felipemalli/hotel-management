// `YYYY-MM-DD` nunca passa por `new Date()`: o construtor lê a forma só-data
// como meia-noite UTC e, em America/Sao_Paulo (UTC-3), volta um dia. O split
// literal é imune a fuso.
export function formatISODate(value: string): string {
  const [year, month, day] = value.split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

export function formatISODateTime(value: string): string {
  const [datePart, timePart] = value.split('T')
  if (!datePart) return value
  const date = formatISODate(datePart)
  if (!timePart) return date
  return `${date} ${timePart.slice(0, 5)}`
}

export function todayISO(now: Date = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDaysISO(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map((part) => Number.parseInt(part, 10))
  if (year === undefined || month === undefined || day === undefined) return isoDate
  const shifted = new Date(year, month - 1, day + days)
  return todayISO(shifted)
}
