import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ProtectedRoute } from '@/app/ProtectedRoute'
import { signInForTest } from '@/test/renderWithProviders'

function renderProtectedApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
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
      </Routes>
    </MemoryRouter>,
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

  it('preserva a rota tentada para o retorno depois do login', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/login" element={<LocationProbe />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <h1>Painel da recepção</h1>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('from')).toHaveTextContent('/')
  })
})

function LocationProbe() {
  const state = useLocation().state as { from?: string } | null
  return <p data-testid="from">{state?.from ?? 'sem origem'}</p>
}
