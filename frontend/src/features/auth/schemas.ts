import { z } from 'zod'

import { requiredString } from '@/lib/forms/forms'

import type { Credentials, SessionToken } from './api'

export const credentialsSchema = z.object({
  username: requiredString(),
  password: requiredString(),
}) satisfies z.ZodType<Credentials>

export const sessionTokenSchema = z.object({
  access: z.string().min(1),
}) satisfies z.ZodType<SessionToken>

export const userRoleSchema = z.enum(['ATTENDANT', 'ADMIN'])

export const currentUserSchema = z.object({
  id: z.number().int(),
  username: z.string().min(1),
  role: userRoleSchema,
})
