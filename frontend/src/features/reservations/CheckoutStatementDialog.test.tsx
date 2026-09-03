import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { formatBRL } from '@/lib/money'
import { elementAt } from '@/test/fixtures'

import { BILL_FIXTURES, BILL_TOTALS, T1_STATEMENT, T7_STATEMENT } from './__fixtures__/bills'
import { CheckoutStatementDialog } from './CheckoutStatementDialog'

function renderStatement(statement = T7_STATEMENT) {
  return render(<CheckoutStatementDialog open statement={statement} onClose={vi.fn()} />)
}

function dailyRows() {
  const table = screen.getByRole('table', { name: 'Diárias cobradas' })
  return within(table).getAllByRole('row').slice(1)
}

describe('CheckoutStatementDialog', () => {
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

    expect(screen.getByText('Multa de checkout tardio (50% de R$ 180,00)')).toBeInTheDocument()
    expect(screen.getByText('R$ 90,00')).toBeInTheDocument()

    expect(screen.getByText('Total a pagar')).toBeInTheDocument()
    expect(screen.getByText('R$ 425,00')).toBeInTheDocument()
    expect(screen.getByText(formatBRL(BILL_TOTALS.T7))).toBeInTheDocument()
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
    expect(screen.getAllByText('R$ 0,00')).toHaveLength(3) // 2 vagas + subtotal vaga

    // R$ 240,00 aparece duas vezes em T1 (subtotal de diarias e total), por isso
    // a assercao vai ao par label/valor da linha, e nao ao documento todo.
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
    render(<CheckoutStatementDialog open={false} statement={T7_STATEMENT} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
