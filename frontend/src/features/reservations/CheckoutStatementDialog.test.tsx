import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { formatBRL } from '@/lib/money'
import { elementAt } from '@/test/fixtures'

import { CheckoutStatementDialog } from './CheckoutStatementDialog'
import { BILL_FIXTURES, BILL_TOTALS, T1_STATEMENT, T7_STATEMENT } from './__fixtures__/bills'

/**
 * SPEC 6.2 — `features/reservations/CheckoutStatementDialog.test.tsx`.
 *
 * Provas de RF7, RN1, RN2, RN3, RN5 e RN6 na matriz SPEC 6.3. Doutrina da
 * SPEC 6.3 aplicada ao pe da letra: **nada e recalculado aqui**. Os fixtures
 * sao copia literal da tabela SPEC 3.3, e o teste so verifica que o valor certo
 * aparece no lugar certo — e, no caso da multa, apenas quando aplicavel.
 */

function renderStatement(statement = T7_STATEMENT) {
  return render(<CheckoutStatementDialog open statement={statement} onClose={() => {}} />)
}

/** As diarias do extrato: o `tbody` da tabela "Diárias cobradas". */
function dailyRows() {
  const table = screen.getByRole('table', { name: 'Diárias cobradas' })
  return within(table).getAllByRole('row').slice(1)
}

describe('CheckoutStatementDialog', () => {
  it('test_T7_full_statement', () => {
    renderStatement(T7_STATEMENT)

    // O extrato e o requisito de exibicao da RN6: um dialogo nomeado.
    const dialog = screen.getByRole('dialog', { name: 'Extrato de checkout' })
    expect(dialog).toHaveTextContent('Gabriela Reis')

    // Duas linhas de diaria: sexta 07/03 e sabado 08/03 (intervalo semiaberto, D1).
    const rows = dailyRows()
    expect(rows).toHaveLength(2)

    // RN1: a diaria de sexta-feira exibe R$ 120,00 e a vaga util, R$ 15,00.
    expect(within(elementAt(rows, 0)).getByText('07/03/2025')).toBeInTheDocument()
    expect(within(elementAt(rows, 0)).getByText('sexta-feira')).toBeInTheDocument()
    expect(within(elementAt(rows, 0)).getByText('R$ 120,00')).toBeInTheDocument()
    expect(within(elementAt(rows, 0)).getByText('R$ 15,00')).toBeInTheDocument()

    // RN2: a diaria de sabado exibe R$ 180,00. RN3: a vaga de fds, R$ 20,00.
    expect(within(elementAt(rows, 1)).getByText('08/03/2025')).toBeInTheDocument()
    expect(within(elementAt(rows, 1)).getByText('sábado')).toBeInTheDocument()
    expect(within(elementAt(rows, 1)).getByText('R$ 180,00')).toBeInTheDocument()
    expect(within(elementAt(rows, 1)).getByText('R$ 20,00')).toBeInTheDocument()

    // Subtotais do payload SPEC 4.4, exibidos como vieram.
    expect(screen.getByText('Subtotal diárias')).toBeInTheDocument()
    expect(screen.getByText('R$ 300,00')).toBeInTheDocument()
    expect(screen.getByText('Subtotal vaga')).toBeInTheDocument()
    expect(screen.getByText('R$ 35,00')).toBeInTheDocument()

    // RN5: a multa aparece com a base do dia da saida (domingo, D3) e o valor.
    expect(screen.getByText('Multa de checkout tardio (50% de R$ 180,00)')).toBeInTheDocument()
    expect(screen.getByText('R$ 90,00')).toBeInTheDocument()

    // RN6: total geral em destaque — R$ 425,00 da linha T7 da SPEC 3.3.
    expect(screen.getByText('Total a pagar')).toBeInTheDocument()
    expect(screen.getByText('R$ 425,00')).toBeInTheDocument()
    expect(screen.getByText(formatBRL(BILL_TOTALS.T7))).toBeInTheDocument()
  })

  it('test_T1_no_late_fee_line', () => {
    renderStatement(T1_STATEMENT)

    // Saida as 11:00: `late_fee.applied` e false, logo a linha nao existe.
    expect(screen.queryByText(/multa/i)).not.toBeInTheDocument()
    expect(screen.queryByText('R$ 60,00')).not.toBeInTheDocument()

    // RN1: as duas diarias uteis exibem R$ 120,00, e a vaga, R$ 0,00.
    const rows = dailyRows()
    expect(rows).toHaveLength(2)
    expect(within(elementAt(rows, 0)).getByText('segunda-feira')).toBeInTheDocument()
    expect(within(elementAt(rows, 1)).getByText('terça-feira')).toBeInTheDocument()
    expect(screen.getAllByText('R$ 120,00')).toHaveLength(2)
    expect(screen.getAllByText('R$ 0,00')).toHaveLength(3) // 2 vagas + subtotal vaga

    // R$ 240,00 aparece duas vezes em T1 (subtotal de diarias e total): a
    // assercao e no par label/valor da linha de total, nao no documento todo.
    expect(screen.getByText('Total a pagar').parentElement).toHaveTextContent(
      formatBRL(BILL_TOTALS.T1),
    )
  })

  it('exibe o total e a linha de multa de cada caso da tabela SPEC 3.3', () => {
    for (const [id, statement] of Object.entries(BILL_FIXTURES)) {
      const view = renderStatement(statement)

      expect(dailyRows()).toHaveLength(statement.lines.length)
      const total = screen.getByText('Total a pagar').parentElement
      expect(total).toHaveTextContent(formatBRL(BILL_TOTALS[id as keyof typeof BILL_TOTALS]))

      const lateFeeLine = screen.queryByText(/^Multa de checkout tardio/)
      if (statement.late_fee.applied) {
        expect(lateFeeLine).not.toBeNull()
        expect(lateFeeLine?.parentElement).toHaveTextContent(formatBRL(statement.late_fee.amount))
      } else {
        expect(lateFeeLine).toBeNull()
      }

      view.unmount()
    }
  })

  it('nao renderiza nada com `open` falso', () => {
    render(<CheckoutStatementDialog open={false} statement={T7_STATEMENT} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
