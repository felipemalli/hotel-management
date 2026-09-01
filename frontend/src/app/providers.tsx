import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { Toaster } from '@/components/ui/Toaster'
import { createQueryClient } from '@/lib/queryClient'

/**
 * Providers da app (SPEC 5.1). Sem Redux/Zustand: o servidor e a fonte de
 * estado (SPEC 5.2) e o TanStack Query e o cache dessa fonte.
 *
 * O `Toaster` entra aqui, e nao em cada pagina, porque o handler global de
 * erros da SPEC 8.2/E vive no `MutationCache` do proprio `queryClient`: uma
 * fila, uma regiao `aria-live`, montada uma vez.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  )
}
