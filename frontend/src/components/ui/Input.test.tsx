import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'

import { Input } from './Input'

describe('Input', () => {
  it('encaminha o ref para o elemento do DOM, para o foco automatico do formulario', () => {
    const ref = createRef<HTMLInputElement>()
    render(<Input label="Nome" ref={ref} />)

    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it('renderiza a dica e o erro juntos, em vez de a dica sumir quando mais importa', () => {
    render(<Input label="Documento" hint="CPF, RG ou passaporte." error="Campo obrigatório." />)

    const hint = screen.getByText('CPF, RG ou passaporte.')
    const error = screen.getByText('Campo obrigatório.')
    const input = screen.getByLabelText('Documento')

    expect(hint).toBeInTheDocument()
    expect(error).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', `${hint.id} ${error.id}`)
  })

  it('so descreve a dica quando nao ha erro', () => {
    render(<Input label="Telefone" hint="Com DDD." />)

    const input = screen.getByLabelText('Telefone')
    const hint = screen.getByText('Com DDD.')

    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).toHaveAttribute('aria-describedby', hint.id)
  })
})
