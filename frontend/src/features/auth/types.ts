import type { z } from 'zod'

import type { currentUserSchema, userRoleSchema } from './schemas'

export type UserRole = z.infer<typeof userRoleSchema>

export type CurrentUser = z.infer<typeof currentUserSchema>
