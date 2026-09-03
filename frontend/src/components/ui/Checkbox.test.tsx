import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'

import { Checkbox } from './Checkbox'

describe('Checkbox', () => {
  it('encaminha o ref para o elemento do DOM, para o foco automatico do formulario', () => {
    const ref = createRef<HTMLInputElement>()
    render(<Checkbox label="Vaga" ref={ref} />)

    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it('mantem o nome acessivel e o papel de checkbox', () => {
    render(<Checkbox label="Utilizará vaga de estacionamento" />)

    expect(
      screen.getByRole('checkbox', { name: 'Utilizará vaga de estacionamento' }),
    ).toBeInTheDocument()
  })

  it('expoe erro e dica com aria-describedby', () => {
    render(<Checkbox label="Vaga" hint="Opcional." error="Selecione uma opção." />)

    const checkbox = screen.getByRole('checkbox')
    const hint = screen.getByText('Opcional.')
    const error = screen.getByText('Selecione uma opção.')

    expect(checkbox).toHaveAttribute('aria-invalid', 'true')
    expect(checkbox).toHaveAttribute('aria-describedby', `${hint.id} ${error.id}`)
  })
})
