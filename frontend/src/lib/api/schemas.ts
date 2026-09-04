import { z } from 'zod'

// Dinheiro chega como string decimal de duas casas ("120.00").
export const moneyString = z
  .string()
  .regex(/^-?\d+\.\d{2}$/, { error: 'valor monetário fora do decimal de duas casas' })

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'data fora do formato AAAA-MM-DD' })

// Data-hora precisa de deslocamento: a API roda com fuso ativo.
export const isoDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/, {
    error: 'data-hora fora do formato ISO com deslocamento',
  })

export function decimalString(places: number) {
  return z.string().regex(new RegExp(String.raw`^-?\d+\.\d{${places}}$`), {
    error: `valor decimal fora das ${places} casas`,
  })
}

export const factorString = decimalString(4)

export const timeHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
  error: 'horário fora do formato HH:MM',
})

export const userRefSchema = z.object({ id: z.number().int(), username: z.string() })

export function paginated<Item extends z.ZodType>(item: Item) {
  return z.object({
    count: z.number().int(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(item),
  })
}
