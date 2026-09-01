import { render, screen } from '@testing-library/react'

import { App } from './App'

// Teste de fumaca do scaffold (Workstream A): prova que React + Testing Library
// + jsdom estao ligados. A suite de comportamento e do Workstream E (SPEC 6.2).
describe('App', () => {
  it('renderiza o titulo da aplicacao', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /gestão de hóspedes/i })).toBeInTheDocument()
  })
})
