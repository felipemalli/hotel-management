import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPolicy } from '@/features/pricing/api'
import { ApiError } from '@/lib/errors/errors'
import { toastStore } from '@/lib/notify/toast'
import { renderWithProviders } from '@/test/renderWithProviders'

import { BOOTSTRAP_POLICY, HIGH_SEASON_POLICY } from './__fixtures__/policies'
import { PolicyForm } from './PolicyForm'
import { CHECKOUT_LIMIT_MESSAGE } from './schemas'

vi.mock('@/features/pricing/api')

function renderForm(onSuccess = vi.fn()) {
  renderWithProviders(<PolicyForm current={BOOTSTRAP_POLICY} onSuccess={onSuccess} />)
  return { onSuccess }
}

async function retype(label: string, value: string) {
  const user = userEvent.setup()
  await user.clear(screen.getByLabelText(label))
  await user.type(screen.getByLabelText(label), value)
}

describe('PolicyForm', () => {
  beforeEach(() => {
    vi.mocked(createPolicy).mockResolvedValue(HIGH_SEASON_POLICY)
  })

  it('vem preenchido com a tarifa vigente, em notacao brasileira', () => {
    renderForm()

    expect(screen.getByLabelText('Diária (seg–sex)')).toHaveValue('120,00')
    expect(screen.getByLabelText('Fator da multa de checkout tardio')).toHaveValue('0,5000')
    expect(screen.getByLabelText('Abertura do check-in')).toHaveValue('14:00')
    expect(screen.getByLabelText('Nota (opcional)')).toHaveValue('')
  })

  it('test_normalizes_money_and_factor_before_posting', async () => {
    const user = userEvent.setup()
    const { onSuccess } = renderForm()

    await retype('Diária (seg–sex)', '150,5')
    await retype('Fator da multa de checkout tardio', '0,25')
    await user.click(screen.getByRole('button', { name: 'Publicar tarifa' }))

    await waitFor(() =>
      expect(createPolicy).toHaveBeenCalledWith({
        weekday_rate: '150.50',
        weekend_rate: '180.00',
        weekday_park: '15.00',
        weekend_park: '20.00',
        late_fee_factor: '0.2500',
        checkin_opens: '14:00',
        checkout_limit: '12:00',
        note: '',
      }),
    )
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(HIGH_SEASON_POLICY))
  })

  it('barra tres casas decimais antes de chamar a API', async () => {
    const user = userEvent.setup()
    renderForm()

    await retype('Diária (seg–sex)', '12.345')
    await user.click(screen.getByRole('button', { name: 'Publicar tarifa' }))

    expect(createPolicy).not.toHaveBeenCalled()
    expect(
      await screen.findByText('Informe um valor como 120 ou 120,50 (até dois centavos).'),
    ).toBeInTheDocument()
  })

  it('barra o limite de checkout depois da abertura com a frase do servidor', async () => {
    const user = userEvent.setup()
    renderForm()

    // `type="time"` não se digita tecla a tecla: o browser entrega o valor.
    fireEvent.change(screen.getByLabelText('Limite de checkout'), { target: { value: '15:00' } })
    await user.click(screen.getByRole('button', { name: 'Publicar tarifa' }))

    expect(createPolicy).not.toHaveBeenCalled()
    expect(await screen.findByText(CHECKOUT_LIMIT_MESSAGE)).toBeInTheDocument()
  })

  it('devolve ao campo culpado o 400 do servidor', async () => {
    const user = userEvent.setup()
    vi.mocked(createPolicy).mockRejectedValue(
      new ApiError({
        code: 'VALIDATION_ERROR',
        detail: 'Dados inválidos.',
        status: 400,
        extra: { checkout_limit: [CHECKOUT_LIMIT_MESSAGE] },
      }),
    )
    renderForm()

    await user.click(screen.getByRole('button', { name: 'Publicar tarifa' }))

    expect(await screen.findByText(CHECKOUT_LIMIT_MESSAGE)).toBeInTheDocument()
    expect(screen.getByLabelText('Limite de checkout')).toHaveAttribute('aria-invalid', 'true')
  })

  it('deixa o 403 para o toast global', async () => {
    const user = userEvent.setup()
    vi.mocked(createPolicy).mockRejectedValue(
      new ApiError({
        code: 'PERMISSION_DENIED',
        detail: 'Ação restrita ao administrador do hotel.',
        status: 403,
      }),
    )
    renderForm()

    await user.click(screen.getByRole('button', { name: 'Publicar tarifa' }))

    await waitFor(() =>
      expect(toastStore.getSnapshot()).toEqual([
        expect.objectContaining({ message: 'Ação restrita ao administrador do hotel.' }),
      ]),
    )
  })
})
