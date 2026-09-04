import type { QueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/app/AppLayout'

import { renderWithProviders } from './renderWithProviders'

export interface RenderPageOptions {
  route: string
  path?: string
  queryClient?: QueryClient
}

// Monta a página dentro do `AppLayout` real, como o roteador faz: é o que dá ao
// teste o `<main id="main">` que `focusMainContent` procura, e o menu que o
// atendente vê. Mora em arquivo próprio porque `renderWithProviders` é usado
// por quase toda a suíte, e arrastar a casca (com a consulta do papel) para
// dentro de cada teste custaria um dublê que o teste não pediu.
export function renderPage(
  page: ReactElement,
  { route, path = route, queryClient }: RenderPageOptions,
) {
  return renderWithProviders(
    <Routes>
      <Route element={<AppLayout />}>
        <Route path={path} element={page} />
      </Route>
    </Routes>,
    { route, queryClient },
  )
}
