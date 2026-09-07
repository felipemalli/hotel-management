import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FOURTEEN_NIGHTS_QUOTE, WEEKDAY_NIGHT_QUOTE } from '@/features/pricing/__fixtures__/quotes'
import { ApiError } from '@/lib/errors/errors'
import { formatBRL } from '@/lib/format/money'
import { renderWithProviders } from '@/test/renderWithProviders'

import { StayQuoteCard } from './StayQuoteCard'

describe('StayQuoteCard', () => {
  it('mostra o breakdown linha a linha da fixture de 14 noites', () => {
    renderWithProviders(
      <StayQuoteCard
        quote={FOURTEEN_NIGHTS_QUOTE}
        isPending={false}
        isError={false}
        error={null}
        enabled
        onRetry={vi.fn()}
      />,
    )

    const table = screen.getByRole('table', { name: 'Composição do valor estimado' })
    expect(table).toHaveTextContent('10x seg–sex')
    expect(table).toHaveTextContent('10 × R$ 120,00 + R$ 15,00')
    expect(table).toHaveTextContent('4x sáb–dom')
    expect(table).toHaveTextContent('4 × R$ 180,00 + R$ 20,00')
    expect(screen.getByText('14 noites')).toBeInTheDocument()
    expect(screen.getByText(formatBRL(FOURTEEN_NIGHTS_QUOTE.subtotal_daily))).toBeInTheDocument()
    expect(screen.getByText(formatBRL(FOURTEEN_NIGHTS_QUOTE.subtotal_parking))).toBeInTheDocument()
    expect(screen.getByText(formatBRL(FOURTEEN_NIGHTS_QUOTE.total))).toBeInTheDocument()
  })

  it('omite a parcela da vaga na conta quando o estacionamento e zero', () => {
    renderWithProviders(
      <StayQuoteCard
        quote={WEEKDAY_NIGHT_QUOTE}
        isPending={false}
        isError={false}
        error={null}
        enabled
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('1 noite')).toBeInTheDocument()
    expect(screen.getByText('1 × R$ 120,00')).toBeInTheDocument()
    expect(screen.queryByText(/\+ R\$ 0,00/)).not.toBeInTheDocument()
    expect(
      screen.getByLabelText(`Total estimado ${formatBRL(WEEKDAY_NIGHT_QUOTE.total)}`),
    ).toBeInTheDocument()
  })

  it('pede datas validas quando o periodo ainda nao fecha', () => {
    renderWithProviders(
      <StayQuoteCard
        quote={undefined}
        isPending={false}
        isError={false}
        error={null}
        enabled={false}
        onRetry={vi.fn()}
      />,
    )

    expect(
      screen.getByText('Informe entrada e saída válidas para ver o valor estimado.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('anuncia o calculo enquanto a estimativa nao chegou', () => {
    renderWithProviders(
      <StayQuoteCard
        quote={undefined}
        isPending
        isError={false}
        error={null}
        enabled
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Calculando valor estimado…')
  })

  it('oferece nova tentativa quando a consulta falha', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    renderWithProviders(
      <StayQuoteCard
        quote={undefined}
        isPending={false}
        isError
        error={new ApiError({ code: 'NETWORK_ERROR', detail: 'sem rede', status: 0 })}
        enabled
        onRetry={onRetry}
      />,
    )

    expect(screen.getByText('Não foi possível falar com o servidor.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
