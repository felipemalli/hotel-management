import { z } from 'zod'

import { requiredString } from '@/lib/forms'
import type { TokenPair } from '@/lib/session'

import type { Credentials } from './api'

export const credentialsSchema = z.object({
  username: requiredString(),
  password: requiredString(),
}) satisfies z.ZodType<Credentials>

export const tokenPairSchema = z.object({
  access: z.string().min(1),
  refresh: z.string().min(1),
}) satisfies z.ZodType<TokenPair>
