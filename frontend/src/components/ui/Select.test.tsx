import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'

import { Select } from './Select'

function options() {
  return (
    <>
      <option value="">Selecione…</option>
      <option value="BR">Brasil</option>
    </>
  )
}

describe('Select', () => {
  it('encaminha o ref para o elemento do DOM, como o formulario espera', () => {
    const ref = createRef<HTMLSelectElement>()
    render(
      <Select label="Nacionalidade" ref={ref}>
        {options()}
      </Select>,
    )

    expect(ref.current).toBeInstanceOf(HTMLSelectElement)
  })

  it('renderiza a dica e o erro juntos e descreve os dois', () => {
    render(
      <Select label="Nacionalidade" hint="Codigo ISO." error="Selecione a nacionalidade.">
        {options()}
      </Select>,
    )

    const hint = screen.getByText('Codigo ISO.')
    const error = screen.getByText('Selecione a nacionalidade.')
    const select = screen.getByRole('combobox', { name: 'Nacionalidade' })

    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAttribute('aria-describedby', `${hint.id} ${error.id}`)
  })

  it('so descreve a dica quando nao ha erro', () => {
    render(
      <Select label="Quarto" hint="Somente os livres no periodo.">
        {options()}
      </Select>,
    )

    const select = screen.getByLabelText('Quarto')
    const hint = screen.getByText('Somente os livres no periodo.')

    expect(select).not.toHaveAttribute('aria-invalid')
    expect(select).toHaveAttribute('aria-describedby', hint.id)
  })

  it('entrega as opcoes que recebe', () => {
    render(
      <Select label="Nacionalidade" defaultValue="BR">
        {options()}
      </Select>,
    )

    expect(screen.getByRole('option', { name: 'Brasil' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nacionalidade')).toHaveValue('BR')
  })
})
