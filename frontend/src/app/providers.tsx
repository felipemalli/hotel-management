import { QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useEffect, useState } from 'react'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Toaster } from '@/components/ui'
import { createQueryClient } from '@/lib/queryClient'
import { session } from '@/lib/session'

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)

  // Purga do cache em um lugar só: todo caminho que encerra a sessão passa por
  // aqui — o botão "Sair", o 401 sem refresh utilizável e o sign-out em outra
  // aba. O próximo atendente não herda a listagem do anterior.
  useEffect(
    () =>
      session.subscribe(() => {
        if (session.getAccessToken() === null) queryClient.clear()
      }),
    [queryClient],
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary scope="app">{children}</ErrorBoundary>
      <Toaster />
    </QueryClientProvider>
  )
}
