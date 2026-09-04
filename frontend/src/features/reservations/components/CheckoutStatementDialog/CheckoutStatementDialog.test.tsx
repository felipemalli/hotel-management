import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  BILL_FIXTURES,
  BILL_TOTALS,
  PAID_T7_STATEMENT,
  T1_STATEMENT,
  T7_STATEMENT,
} from '@/features/reservations/__fixtures__/bills'
import { formatBRL } from '@/lib/format/money'
import { elementAt } from '@/test/fixtures'
import { renderWithProviders } from '@/test/renderWithProviders'

import { CheckoutStatementDialog } from './CheckoutStatementDialog'

vi.mock('@/features/reservations/api')

function renderStatement(statement = T7_STATEMENT, allowPayment = false) {
  return renderWithProviders(
    <CheckoutStatementDialog
      open
      statement={statement}
      onClose={vi.fn()}
      allowPayment={allowPayment}
    />,
  )
}

function dailyRows() {
  const table = screen.getByRole('table', { name: 'Diárias cobradas' })
  return within(table).getAllByRole('row').slice(1)
}

describe('CheckoutStatementDialog · RF7 · RN1 · RN2 · RN3 · RN5 · RN6', () => {
  it('test_T7_full_statement', () => {
    renderStatement(T7_STATEMENT)

    const dialog = screen.getByRole('dialog', { name: 'Extrato de checkout' })
    expect(dialog).toHaveTextContent('Gabriela Reis')

    const rows = dailyRows()
    expect(rows).toHaveLength(2)

    expect(within(elementAt(rows, 0)).getByText('07/03/2025')).toBeInTheDocument()
    expect(within(elementAt(rows, 0)).getByText('sexta-feira')).toBeInTheDocument()
    expect(within(elementAt(rows, 0)).getByText('R$ 120,00')).toBeInTheDocument()
    expect(within(elementAt(rows, 0)).getByText('R$ 15,00')).toBeInTheDocument()

    expect(within(elementAt(rows, 1)).getByText('08/03/2025')).toBeInTheDocument()
    expect(within(elementAt(rows, 1)).getByText('sábado')).toBeInTheDocument()
    expect(within(elementAt(rows, 1)).getByText('R$ 180,00')).toBeInTheDocument()
    expect(within(elementAt(rows, 1)).getByText('R$ 20,00')).toBeInTheDocument()

    expect(screen.getByText('Subtotal diárias')).toBeInTheDocument()
    expect(screen.getByText('R$ 300,00')).toBeInTheDocument()
    expect(screen.getByText('Subtotal vaga')).toBeInTheDocument()
    expect(screen.getByText('R$ 35,00')).toBeInTheDocument()

    // O extrato não carrega o fator da multa: a linha nomeia a base, não uma %.
    expect(screen.getByText('Multa de checkout tardio (base R$ 180,00)')).toBeInTheDocument()
    expect(screen.getByText('R$ 90,00')).toBeInTheDocument()

    expect(screen.getByText('Total a pagar')).toBeInTheDocument()
    expect(screen.getByText('R$ 425,00')).toBeInTheDocument()
    expect(screen.getByText(formatBRL(BILL_TOTALS.T7))).toBeInTheDocument()

    expect(screen.getByText('Em aberto')).toBeInTheDocument()
  })

  it('test_T1_no_late_fee_line', () => {
    renderStatement(T1_STATEMENT)

    expect(screen.queryByText(/multa/i)).not.toBeInTheDocument()
    expect(screen.queryByText('R$ 60,00')).not.toBeInTheDocument()

    const rows = dailyRows()
    expect(rows).toHaveLength(2)
    expect(within(elementAt(rows, 0)).getByText('segunda-feira')).toBeInTheDocument()
    expect(within(elementAt(rows, 1)).getByText('terça-feira')).toBeInTheDocument()
    expect(screen.getAllByText('R$ 120,00')).toHaveLength(2)
    // R$ 0,00: duas vagas + subtotal da vaga.
    expect(screen.getAllByText('R$ 0,00')).toHaveLength(3)

    // R$ 240,00 aparece no subtotal e no total: afirmar na linha, não no documento.
    // eslint-disable-next-line testing-library/no-node-access -- o par label/valor nao tem nome acessivel proprio: a assercao precisa do container da linha.
    expect(screen.getByText('Total a pagar').parentElement).toHaveTextContent(
      formatBRL(BILL_TOTALS.T1),
    )
  })

  it('exibe o total e a linha de multa de cada um dos nove casos', () => {
    for (const [id, statement] of Object.entries(BILL_FIXTURES)) {
      const view = renderStatement(statement)

      expect(dailyRows()).toHaveLength(statement.lines.length)
      // eslint-disable-next-line testing-library/no-node-access -- o par label/valor nao tem nome acessivel proprio: a assercao precisa do container da linha.
      const total = screen.getByText('Total a pagar').parentElement
      expect(total).toHaveTextContent(formatBRL(BILL_TOTALS[id as keyof typeof BILL_TOTALS]))

      const lateFeeLine = screen.queryByText(/^Multa de checkout tardio/)
      if (statement.late_fee.applied) {
        expect(lateFeeLine).not.toBeNull()
        // eslint-disable-next-line testing-library/no-node-access -- o par label/valor nao tem nome acessivel proprio: a assercao precisa do container da linha.
        expect(lateFeeLine?.parentElement).toHaveTextContent(formatBRL(statement.late_fee.amount))
      } else {
        expect(lateFeeLine).toBeNull()
      }

      view.unmount()
    }
  })

  it('nao renderiza nada com `open` falso', () => {
    renderWithProviders(
      <CheckoutStatementDialog open={false} statement={T7_STATEMENT} onClose={vi.fn()} />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('CheckoutStatementDialog · pagamento', () => {
  it('mostra o pagamento registrado em vez do formulario', () => {
    renderStatement(PAID_T7_STATEMENT, true)

    expect(screen.getByText('Pago')).toBeInTheDocument()
    expect(screen.getByText('Pago em 09/03/2025 12:30 · Pix · por atendente')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar pagamento' })).not.toBeInTheDocument()
  })

  it('sem allowPayment mostra "Em aberto" sem oferecer o registro', () => {
    renderStatement(T7_STATEMENT)

    expect(screen.getByText('Em aberto')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar pagamento' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Forma de pagamento' })).not.toBeInTheDocument()
  })

  // Select do Base UI não abre em jsdom (floating-ui); ver src/test/setup.ts.
  it('desabilita o registro por padrao, sem forma de pagamento escolhida', () => {
    renderStatement(T7_STATEMENT, true)

    expect(screen.getByRole('button', { name: 'Registrar pagamento' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Forma de pagamento' })).toHaveTextContent(
      'Selecione…',
    )
  })
})
