import { z } from 'zod'

// Dinheiro chega como string decimal de duas casas ("120.00"). O schema recusa
// qualquer outra forma em vez de deixar a tela decidir o que fazer com ela: o
// frontend não converte, não arredonda e não soma.
export const moneyString = z
  .string()
  .regex(/^-?\d+\.\d{2}$/, { error: 'valor monetário fora do decimal de duas casas' })

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'data fora do formato AAAA-MM-DD' })

// Data-hora sempre com deslocamento (a API roda com fuso ativo): é o que
// permite formatar em America/Sao_Paulo sem adivinhar o fuso de origem.
export const isoDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/, {
    error: 'data-hora fora do formato ISO com deslocamento',
  })

export function paginated<Item extends z.ZodType>(item: Item) {
  return z.object({
    count: z.number().int(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(item),
  })
}
