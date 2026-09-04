import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Pagination } from './Pagination'

function setup(props: Partial<Parameters<typeof Pagination>[0]> = {}) {
  const onPageChange = vi.fn()
  render(
    <Pagination page={2} count={45} hasNext hasPrevious onPageChange={onPageChange} {...props} />,
  )
  return { onPageChange }
}

describe('Pagination', () => {
  it('situa o atendente na pagina e no total de registros', () => {
    setup()

    expect(screen.getByRole('navigation', { name: 'Paginação' })).toBeInTheDocument()
    expect(screen.getByText('Página 2 · 45 registros')).toBeInTheDocument()
  })

  it('concorda o singular do registro unico', () => {
    setup({ count: 1, page: 1, hasNext: false, hasPrevious: false })

    expect(screen.getByText('Página 1 · 1 registro')).toBeInTheDocument()
  })

  it('avanca e volta pelo que o servidor disse existir', async () => {
    const user = userEvent.setup()
    const { onPageChange } = setup()

    await user.click(screen.getByRole('button', { name: 'Próxima' }))
    await user.click(screen.getByRole('button', { name: 'Anterior' }))

    expect(onPageChange).toHaveBeenNthCalledWith(1, 3)
    expect(onPageChange).toHaveBeenNthCalledWith(2, 1)
  })

  it('desabilita a borda que o servidor nao oferece', () => {
    setup({ page: 1, hasPrevious: false, hasNext: true })

    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeEnabled()
  })

  it('some quando nao ha o que paginar', () => {
    setup({ count: 0 })

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
})
