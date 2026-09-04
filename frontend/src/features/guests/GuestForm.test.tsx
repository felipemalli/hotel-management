import { screen, waitFor } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createGuest } from '@/features/guests/api'
import { ApiError } from '@/lib/errors/errors'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ANA } from './__fixtures__/guests'
import { GuestForm } from './GuestForm'
import { PHONE_FORMAT_MESSAGE } from './schemas'

vi.mock('@/features/guests/api')
// O formulário carrega o slot de IA, que consulta o status da feature. Dublado
// para que nenhum teste toque a rede: sem `enabled: true` o slot não renderiza.
vi.mock('@/features/ai/api')

const VALID_PHONE = '+55 21 98888-7777'

async function fillValidGuest(user: UserEvent) {
  await user.type(screen.getByLabelText('Nome completo'), 'Ana Souza')
  await user.type(screen.getByLabelText('Documento'), '123.456.789-01')
  await user.type(screen.getByLabelText('Telefone'), VALID_PHONE)
  await user.selectOptions(screen.getByLabelText('Nacionalidade'), 'BR')
}

describe('GuestForm', () => {
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
    for (const label of ['Nome completo', 'Documento', 'Telefone', 'Nacionalidade']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
    }

    await fillValidGuest(user)
    await user.click(screen.getByRole('button', { name: 'Cadastrar hóspede' }))

    expect(createGuest).toHaveBeenCalledTimes(1)
    expect(createGuest).toHaveBeenCalledWith({
      full_name: 'Ana Souza',
      document: '123.456.789-01',
      phone: VALID_PHONE,
      nationality: 'BR',
    })

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(ANA))
  })

  it('exibe o DUPLICATE_DOCUMENT no campo Documento, o campo culpado', async () => {
    const user = userEvent.setup()
    vi.mocked(createGuest).mockRejectedValue(
      new ApiError({
        code: 'DUPLICATE_DOCUMENT',
        detail: 'Documento já cadastrado.',
        status: 409,
      }),
    )
    renderWithProviders(<GuestForm />)

    await fillValidGuest(user)
    await user.click(screen.getByRole('button', { name: 'Cadastrar hóspede' }))

    const document = await screen.findByLabelText('Documento')
    await waitFor(() => expect(document).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByRole('alert')).toHaveTextContent('Documento já cadastrado.')
  })

  // A mensagem e o valor precisam passar pela regra do cliente: com um telefone
  // curto o schema barraria o submit e a resposta do servidor nunca chegaria.
  it('devolve o VALIDATION_ERROR do servidor ao campo culpado', async () => {
    const user = userEvent.setup()
    vi.mocked(createGuest).mockRejectedValue(
      new ApiError({
        code: 'VALIDATION_ERROR',
        detail: 'Dados inválidos.',
        status: 400,
        extra: { phone: ['Telefone inválido para a região.'] },
      }),
    )
    renderWithProviders(<GuestForm />)

    await fillValidGuest(user)
    await user.click(screen.getByRole('button', { name: 'Cadastrar hóspede' }))

    expect(await screen.findByText('Telefone inválido para a região.')).toBeInTheDocument()
    expect(screen.getByLabelText('Telefone')).toHaveAttribute('aria-invalid', 'true')
  })

  // O servidor exige o DDI e recusa sem ele: barrar aqui poupa a viagem e diz a
  // mesma frase que ele diria.
  it('barra o telefone sem o codigo do pais, antes de chamar a API', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GuestForm />)

    await user.type(screen.getByLabelText('Nome completo'), 'Ana Souza')
    await user.type(screen.getByLabelText('Documento'), '123.456.789-01')
    await user.type(screen.getByLabelText('Telefone'), '(21) 98888-7777')
    await user.selectOptions(screen.getByLabelText('Nacionalidade'), 'BR')
    await user.click(screen.getByRole('button', { name: 'Cadastrar hóspede' }))

    expect(createGuest).not.toHaveBeenCalled()
    expect(await screen.findByText(PHONE_FORMAT_MESSAGE)).toBeInTheDocument()
  })

  it('devolve o VALIDATION_ERROR de nacionalidade ao select', async () => {
    const user = userEvent.setup()
    vi.mocked(createGuest).mockRejectedValue(
      new ApiError({
        code: 'VALIDATION_ERROR',
        detail: 'Dados inválidos.',
        status: 400,
        extra: {
          nationality: ['Informe a nacionalidade como código ISO 3166-1 alpha-2, ex.: BR.'],
        },
      }),
    )
    renderWithProviders(<GuestForm />)

    await fillValidGuest(user)
    await user.click(screen.getByRole('button', { name: 'Cadastrar hóspede' }))

    expect(
      await screen.findByText('Informe a nacionalidade como código ISO 3166-1 alpha-2, ex.: BR.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Nacionalidade')).toHaveAttribute('aria-invalid', 'true')
  })

  it('exige a nacionalidade e lista o Brasil como primeira opcao', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GuestForm />)

    await user.type(screen.getByLabelText('Nome completo'), 'Ana Souza')
    await user.type(screen.getByLabelText('Documento'), '123.456.789-01')
    await user.type(screen.getByLabelText('Telefone'), VALID_PHONE)
    await user.click(screen.getByRole('button', { name: 'Cadastrar hóspede' }))

    expect(createGuest).not.toHaveBeenCalled()
    expect(await screen.findByText('Campo obrigatório.')).toBeInTheDocument()

    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveValue('')
    expect(options[1]).toHaveValue('BR')
    expect(options[1]).toHaveTextContent('Brasil')
  })

  it('mostra no alerta do topo o erro que não pertence a nenhum campo', async () => {
    const user = userEvent.setup()
    vi.mocked(createGuest).mockRejectedValue(
      new ApiError({
        code: 'VALIDATION_ERROR',
        detail: 'Dados inválidos.',
        status: 400,
        extra: { non_field_errors: ['Cadastro bloqueado para este documento.'] },
      }),
    )
    renderWithProviders(<GuestForm />)

    await fillValidGuest(user)
    await user.click(screen.getByRole('button', { name: 'Cadastrar hóspede' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cadastro bloqueado para este documento.',
    )
  })

  it('limpa o erro do servidor assim que o atendente corrige o campo', async () => {
    const user = userEvent.setup()
    vi.mocked(createGuest).mockRejectedValue(
      new ApiError({
        code: 'VALIDATION_ERROR',
        detail: 'Dados inválidos.',
        status: 400,
        extra: { phone: ['Telefone inválido para a região.'] },
      }),
    )
    renderWithProviders(<GuestForm />)

    await fillValidGuest(user)
    await user.click(screen.getByRole('button', { name: 'Cadastrar hóspede' }))
    expect(await screen.findByText('Telefone inválido para a região.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Telefone'), '6')

    await waitFor(() =>
      expect(screen.queryByText('Telefone inválido para a região.')).not.toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Telefone')).not.toHaveAttribute('aria-invalid')
  })
})
