import { z } from 'zod'

import { requiredString } from '@/lib/forms'

import type { Credentials } from './api'

export const credentialsSchema = z.object({
  username: requiredString(),
  password: requiredString(),
}) satisfies z.ZodType<Credentials>
