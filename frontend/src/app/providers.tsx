import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, type ReactNode, Suspense, useEffect, useState } from 'react'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Toaster } from '@/components/ui'
import { createQueryClient } from '@/lib/queryClient'
import { session } from '@/lib/session'

// `DEV` é substituído por `false` no build, o que apaga o `import()` junto com o
// ramo morto: as devtools não geram chunk em produção. O modo `test` fica de
// fora porque o painel montaria em toda árvore renderizada pela suíte.
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
      {QueryDevtools ? (
        <Suspense fallback={null}>
          <QueryDevtools buttonPosition="bottom-left" />
        </Suspense>
      ) : null}
    </QueryClientProvider>
  )
}
