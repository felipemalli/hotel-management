import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, type ReactNode, Suspense, useEffect, useState } from 'react'

import { Toaster } from '@/components/common'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { createQueryClient } from '@/lib/api/queryClient'
import { session } from '@/lib/auth/session'

// DEV=false no build apaga o import(); MODE=test evita o painel na suíte.
const devtoolsEnabled = import.meta.env.DEV && import.meta.env.MODE !== 'test'

const QueryDevtools = devtoolsEnabled
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then((module) => ({
        default: module.ReactQueryDevtools,
      })),
    )
  : null

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)

  // Todo sign-out passa aqui: o próximo atendente não herda o cache.
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
      {QueryDevtools ? (
        <Suspense fallback={null}>
          <QueryDevtools buttonPosition="bottom-left" />
        </Suspense>
      ) : null}
    </QueryClientProvider>
  )
}
