import type { QueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/app/layout/AppLayout'

import { renderWithProviders } from './renderWithProviders'

export interface RenderPageOptions {
  route: string
  path?: string
  queryClient?: QueryClient
}

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
