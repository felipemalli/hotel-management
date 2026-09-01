import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { createQueryClient } from '@/lib/queryClient'

/**
 * Providers da app (SPEC 5.1). Sem Redux/Zustand: o servidor e a fonte de
 * estado (SPEC 5.2) e o TanStack Query e o cache dessa fonte.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
