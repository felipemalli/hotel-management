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

// Decimal com `places` casas, que é a forma como o DRF serializa um
// `DecimalField`. `moneyString` continua com mensagem própria por ser o caso
// mais lido da suíte.
export function decimalString(places: number) {
  return z.string().regex(new RegExp(String.raw`^-?\d+\.\d{${places}}$`), {
    error: `valor decimal fora das ${places} casas`,
  })
}

// Fator da multa: quatro casas, como a coluna.
export const factorString = decimalString(4)

// Precisão de minuto, como o serializer do servidor (`%H:%M`).
export const timeHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
  error: 'horário fora do formato HH:MM',
})

// Ator de uma escrita: quem publicou a tarifa, quem registrou o pagamento.
export const userRefSchema = z.object({ id: z.number().int(), username: z.string() })

export function paginated<Item extends z.ZodType>(item: Item) {
  return z.object({
    count: z.number().int(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(item),
  })
}
