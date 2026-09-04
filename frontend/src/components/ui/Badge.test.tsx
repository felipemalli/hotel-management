import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Badge } from './Badge'

describe('Badge', () => {
  it('mostra o rotulo que recebe', () => {
    render(<Badge>Acompanhante</Badge>)

    expect(screen.getByText('Acompanhante')).toBeInTheDocument()
  })

  it('pinta cada tom de um jeito, para o status nao depender so do texto', () => {
    render(
      <>
        <Badge>neutro</Badge>
        <Badge tone="success">pago</Badge>
        <Badge tone="warning">em aberto</Badge>
        <Badge tone="error">cancelada</Badge>
        <Badge tone="info">admin</Badge>
      </>,
    )

    const classes = ['neutro', 'pago', 'em aberto', 'cancelada', 'admin'].map(
      (label) => screen.getByText(label).className,
    )

    expect(new Set(classes).size).toBe(5)
  })
})
