const TIME_ZONE = 'America/Sao_Paulo'
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

// Partes cruas do relógio do hotel: o navegador pode estar em outro fuso, e
// toda regra de horário (14h, 12h) é decidida em hora de São Paulo.
const LOCAL_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function localParts(now: Date): Record<string, string> {
  const parts: Record<string, string> = {}
  for (const part of LOCAL_PARTS.formatToParts(now)) parts[part.type] = part.value
  return parts
}

function toISODate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// `YYYY-MM-DD` nunca passa por `new Date()`: meia-noite UTC desloca o dia em São Paulo.
export function formatISODate(value: string): string {
  const [year, month, day] = value.split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

export function formatISODateTime(value: string): string {
  const [datePart, timePart] = value.split('T')
  if (!datePart) return value
  if (!timePart) return formatISODate(datePart)

  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) return value
  return `${DATE_FORMAT.format(instant)} ${TIME_FORMAT.format(instant)}`
}

export function todayISO(now: Date = new Date()): string {
  const { year, month, day } = localParts(now)
  return `${year}-${month}-${day}`
}

export function nowTimeISO(now: Date = new Date()): string {
  const { hour, minute, second } = localParts(now)
  return `${hour}:${minute}:${second}`
}

export function isISODate(value: string): boolean {
  const parts = ISO_DATE.exec(value)
  if (!parts) return false

  const [, year = '', month = '', day = ''] = parts
  const parsed = new Date(
    Number.parseInt(year, 10),
    Number.parseInt(month, 10) - 1,
    Number.parseInt(day, 10),
  )
  return toISODate(parsed) === value
}

export function addDaysISO(isoDate: string, days: number): string {
  const parts = ISO_DATE.exec(isoDate)
  if (!parts) return isoDate

  const [, year = '', month = '', day = ''] = parts
  const shifted = new Date(
    Number.parseInt(year, 10),
    Number.parseInt(month, 10) - 1,
    Number.parseInt(day, 10) + days,
  )
  return toISODate(shifted)
}
