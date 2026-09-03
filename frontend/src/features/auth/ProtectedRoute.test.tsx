import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { renderWithProviders, signInForTest } from '@/test/renderWithProviders'

import { ProtectedRoute } from './ProtectedRoute'

function renderProtectedApp() {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<h1>Acesso do atendente</h1>} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <h1>Painel da recepção</h1>
          </ProtectedRoute>
        }
      />
    </Routes>,
    { route: '/' },
  )
}

describe('ProtectedRoute', () => {
  it('test_redirects_anonymous_to_login', () => {
    const view = renderProtectedApp()

    expect(screen.getByRole('heading', { name: 'Acesso do atendente' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Painel da recepção' })).not.toBeInTheDocument()

    view.unmount()

    signInForTest()
    renderProtectedApp()

    expect(screen.getByRole('heading', { name: 'Painel da recepção' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Acesso do atendente' })).not.toBeInTheDocument()
  })
})
