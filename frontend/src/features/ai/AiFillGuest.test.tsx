import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { fetchAiStatus, parseGuestText } from '@/features/ai/api'
import { createGuest } from '@/features/guests/api'
import { GuestForm } from '@/features/guests/GuestForm'
import { renderWithProviders, resetGlobalStores } from '@/test/renderWithProviders'

import { AiFillGuest } from './AiFillGuest'

vi.mock('@/features/ai/api')
vi.mock('@/features/guests/api')

/**
 * Diferencial opcional (SPEC 7) — o portao de fallback visto do frontend.
 *
 * O caso que mais importa e o primeiro: **desligada, a feature nao existe na
 * tela**. Os outros dois provam que, ligada, ela faz exatamente o que o
 * contrato da SPEC 7.1 promete — extrair para o formulario, sem persistir
 * nada. Nenhum destes testes toca a rede.
 */

const EXTRACTED = {
  full_name: 'Ana Souza',
  document: '123.456.789-01',
  phone: '(21) 98888-7777',
}

const FREE_TEXT = 'hóspede Ana Souza cpf 123.456.789-01 cel (21) 98888-7777'

describe('AiFillGuest', () => {
  beforeEach(() => {
    resetGlobalStores()
    vi.mocked(fetchAiStatus).mockReset()
    vi.mocked(parseGuestText).mockReset()
    vi.mocked(parseGuestText).mockResolvedValue(EXTRACTED)
  })

  it('nao renderiza nada enquanto a IA estiver desabilitada', async () => {
    vi.mocked(fetchAiStatus).mockResolvedValue({ enabled: false })
    renderWithProviders(<AiFillGuest onFilled={vi.fn()} />)

    await waitFor(() => expect(fetchAiStatus).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Preencher com IA' })).not.toBeInTheDocument()
  })

  it('extrai os tres campos do texto colado quando habilitada', async () => {
    const user = userEvent.setup()
    const onFilled = vi.fn()
    vi.mocked(fetchAiStatus).mockResolvedValue({ enabled: true })
    renderWithProviders(<AiFillGuest onFilled={onFilled} />)

    await user.click(await screen.findByRole('button', { name: 'Preencher com IA' }))
    await user.type(screen.getByLabelText('Texto livre'), FREE_TEXT)
    await user.click(screen.getByRole('button', { name: 'Extrair campos' }))

    expect(parseGuestText).toHaveBeenCalledWith(FREE_TEXT)
    await waitFor(() => expect(onFilled).toHaveBeenCalledWith(EXTRACTED))
  })

  it('preenche o formulario de cadastro com o resultado, sem submeter', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchAiStatus).mockResolvedValue({ enabled: true })
    renderWithProviders(<GuestForm />)

    await user.click(await screen.findByRole('button', { name: 'Preencher com IA' }))
    await user.type(screen.getByLabelText('Texto livre'), FREE_TEXT)
    await user.click(screen.getByRole('button', { name: 'Extrair campos' }))

    await waitFor(() => expect(screen.getByLabelText('Nome completo')).toHaveValue('Ana Souza'))
    expect(screen.getByLabelText('Documento')).toHaveValue('123.456.789-01')
    expect(screen.getByLabelText('Telefone')).toHaveValue('(21) 98888-7777')
    // Human-in-the-loop: quem cadastra e o atendente, depois de revisar.
    expect(createGuest).not.toHaveBeenCalled()
  })
})
