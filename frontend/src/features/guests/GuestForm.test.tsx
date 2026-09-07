import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createGuest } from '@/features/guests/api'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ANA } from './__fixtures__/guests'
import { GuestForm } from './GuestForm'
import { PHONE_FORMAT_MESSAGE } from './schemas'

vi.mock('@/features/guests/api')

// Select do Base UI não abre em jsdom (floating-ui); ver src/test/setup.ts.
describe('GuestForm · RF1', () => {
  beforeEach(() => {
    vi.mocked(createGuest).mockResolvedValue(ANA)
  })

  it('test_requires_name_document_phone', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    renderWithProviders(<GuestForm onSuccess={onSuccess} />)

    await user.click(screen.getByRole('button', { name: 'Cadastrar hóspede' }))

    expect(createGuest).not.toHaveBeenCalled()
    expect(await screen.findAllByText('Campo obrigatório.')).toHaveLength(4)
    for (const label of ['Nome completo', 'Documento', 'Telefone']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
    }
    expect(screen.getByRole('combobox', { name: 'Nacionalidade' })).toHaveAttribute(
      'aria-invalid',
      'true',
    )

    await user.type(screen.getByLabelText('Nome completo'), 'Ana Souza')
    await user.type(screen.getByLabelText('Documento'), '123.456.789-01')
    await user.type(screen.getByLabelText('Telefone'), '+55 21 98888-7777')
    await user.click(screen.getByRole('button', { name: 'Cadastrar hóspede' }))

    await waitFor(() =>
      expect(screen.getByLabelText('Nome completo')).not.toHaveAttribute('aria-invalid'),
    )
    expect(screen.getByLabelText('Documento')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Telefone')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByRole('combobox', { name: 'Nacionalidade' })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(createGuest).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('barra o telefone sem o codigo do pais e limpa o erro assim que ele e corrigido', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GuestForm />)

    await user.type(screen.getByLabelText('Nome completo'), 'Ana Souza')
    await user.type(screen.getByLabelText('Documento'), '123.456.789-01')
    await user.type(screen.getByLabelText('Telefone'), '98888-7777')
    await user.click(screen.getByRole('button', { name: 'Cadastrar hóspede' }))

    expect(createGuest).not.toHaveBeenCalled()
    expect(await screen.findByText(PHONE_FORMAT_MESSAGE)).toBeInTheDocument()
    expect(screen.getByLabelText('Telefone')).toHaveAttribute('aria-invalid', 'true')

    await user.clear(screen.getByLabelText('Telefone'))
    await user.type(screen.getByLabelText('Telefone'), '55 21 98888-7777')

    await waitFor(() => expect(screen.queryByText(PHONE_FORMAT_MESSAGE)).not.toBeInTheDocument())
    expect(screen.getByLabelText('Telefone')).not.toHaveAttribute('aria-invalid')
  })
})
