import { z } from 'zod'

export const aiStatusSchema = z.object({ enabled: z.boolean() })

// Saída de modelo é entrada não confiável: o servidor já valida a extração, e
// aqui o formulário confere de novo antes de escrever nos campos.
export const parsedGuestSchema = z.object({
  full_name: z.string(),
  document: z.string(),
  phone: z.string(),
})
