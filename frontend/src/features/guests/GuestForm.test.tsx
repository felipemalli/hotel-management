import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createGuest } from '@/features/guests/api'
import { ApiError } from '@/lib/errors'
import { renderWithProviders, resetGlobalStores } from '@/test/renderWithProviders'

import { GuestForm } from './GuestForm'
import type { Guest } from './types'

vi.mock('@/features/guests/api')
// Diferencial opcional da SPEC 7: o formulario carrega o slot da IA, que
// consulta `/api/ai/status/`. Dublado aqui para que nenhum teste toque a rede
// (SPEC 7.2) — sem `enabled: true` o slot renderiza nada, e este arquivo segue
// provando o RF1 exatamente como antes. Corte da SPEC 8.4/C1: apagar estas
// duas linhas.
vi.mock('@/features/ai/api')

/**
 * SPEC 6.2 — `features/guests/GuestForm.test.tsx`.
 * Prova de RF1 na matriz SPEC 6.3: os tres campos minimos do briefing (nome,
 * documento, telefone) sao impostos, e o payload segue o contrato SPEC 4.3.
 *
 * O que este teste **nao** faz: validar formato de documento ou telefone. Essa
 * regra (D9) e do servidor por decisao de projeto; duplicar aqui criaria duas
 * fontes da verdade.
 */

/** Resposta 201 da SPEC 4.3 — PII ja mascarada pelo backend (SPEC 2.2). */
const CREATED_GUEST: Guest = {
  id: 1,
  full_name: 'Ana Souza',
  document: '•••.•••.•89-01',
  phone: '(••) •••••-7777',
  created_at: '2026-09-01T10:00:00-03:00',
}

describe('GuestForm', () => {
  beforeEach(() => {
    resetGlobalStores()
    vi.mocked(createGuest).mockReset()
    vi.mocked(createGuest).mockResolvedValue(CREATED_GUEST)
  })

  it('test_requires_name_document_phone', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    renderWithProviders(<GuestForm onSuccess={onSuccess} />)

    // 1. Submit vazio: os tres campos minimos bloqueiam a requisicao.
    await user.click(screen.getByRole('button', { name: 'Cadastrar hóspede' }))

    expect(createGuest).not.toHaveBeenCalled()
    expect(await screen.findAllByText('Campo obrigatório.')).toHaveLength(3)
    for (const label of ['Nome completo', 'Documento', 'Telefone']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
    }

    // 2. Com os tres preenchidos, sai o payload do contrato SPEC 4.3.
    await user.type(screen.getByLabelText('Nome completo'), 'Ana Souza')
    await user.type(screen.getByLabelText('Documento'), '123.456.789-01')
    await user.type(screen.getByLabelText('Telefone'), '(21) 98888-7777')
    await user.click(screen.getByRole('button', { name: 'Cadastrar hóspede' }))

    expect(createGuest).toHaveBeenCalledTimes(1)
    expect(createGuest).toHaveBeenCalledWith({
      full_name: 'Ana Souza',
      document: '123.456.789-01',
      phone: '(21) 98888-7777',
    })

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(CREATED_GUEST))
  })

  it('exibe o DUPLICATE_DOCUMENT de D12 no campo Documento', async () => {
    const user = userEvent.setup()
    vi.mocked(createGuest).mockRejectedValue(
      new ApiError({
        code: 'DUPLICATE_DOCUMENT',
        detail: 'Documento já cadastrado.',
        status: 409,
      }),
    )
    renderWithProviders(<GuestForm />)

    await user.type(screen.getByLabelText('Nome completo'), 'Ana Souza')
    await user.type(screen.getByLabelText('Documento'), '123.456.789-01')
    await user.type(screen.getByLabelText('Telefone'), '(21) 98888-7777')
    await user.click(screen.getByRole('button', { name: 'Cadastrar hóspede' }))

    const document = await screen.findByLabelText('Documento')
    await waitFor(() => expect(document).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByRole('alert')).toHaveTextContent('Documento já cadastrado.')
  })

  it('devolve o VALIDATION_ERROR da SPEC 4.1 ao campo culpado', async () => {
    const user = userEvent.setup()
    vi.mocked(createGuest).mockRejectedValue(
      new ApiError({
        code: 'VALIDATION_ERROR',
        detail: 'Dados inválidos.',
        status: 400,
        extra: { phone: ['Telefone deve ter ao menos 8 dígitos.'] },
      }),
    )
    renderWithProviders(<GuestForm />)

    await user.type(screen.getByLabelText('Nome completo'), 'Ana Souza')
    await user.type(screen.getByLabelText('Documento'), '123.456.789-01')
    await user.type(screen.getByLabelText('Telefone'), '21')
    await user.click(screen.getByRole('button', { name: 'Cadastrar hóspede' }))

    expect(
      await screen.findByText('Telefone deve ter ao menos 8 dígitos.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Telefone')).toHaveAttribute('aria-invalid', 'true')
  })
})
