import { expect, test } from '@playwright/test'

import { selectOption } from './support'

test.describe(
  'checkout · conta e pagamento',
  { tag: ['@RF7', '@RN1', '@RN2', '@RN3', '@RN5', '@RN6'] },
  () => {
    // Não idempotente: registra o pagamento de verdade. Repetir localmente exige `docker compose down -v`.
    test('confere a conta congelada e registra o pagamento em dinheiro', async ({ page }) => {
      await page.goto('/reservas')

      await selectOption(page, 'Status', 'Finalizada')
      await selectOption(page, 'Pagamento', 'Em aberto')

      const table = page.getByRole('table', { name: 'Reservas' })
      const row = table.getByRole('row').filter({ hasText: '103' }).filter({ hasText: 'R$ 425,00' })
      await expect(row).toBeVisible()

      await row.getByRole('link', { name: /Detalhes/ }).click()

      const account = page.getByRole('region', { name: 'Conta' })
      await expect(account).toBeVisible()
      await expect(account.getByText('R$ 90,00 (base R$ 180,00)')).toBeVisible()

      await page.getByRole('button', { name: 'Ver extrato' }).click()
      const statement = page.getByRole('dialog', { name: 'Extrato de checkout' })
      await expect(statement).toBeVisible()

      const dailyTable = statement.getByRole('table', { name: 'Diárias cobradas' })
      const dailyRows = dailyTable.getByRole('row')
      await expect(dailyRows).toHaveCount(3)

      const friday = dailyRows.filter({ hasText: 'sexta-feira' })
      await expect(friday.getByText('R$ 120,00')).toBeVisible()
      await expect(friday.getByText('R$ 15,00')).toBeVisible()

      const saturday = dailyRows.filter({ hasText: 'sábado' })
      await expect(saturday.getByText('R$ 180,00')).toBeVisible()
      await expect(saturday.getByText('R$ 20,00')).toBeVisible()

      await expect(statement.getByText('R$ 300,00')).toBeVisible()
      await expect(statement.getByText('R$ 35,00')).toBeVisible()
      await expect(statement.getByText(/Multa de checkout tardio/)).toBeVisible()
      await expect(statement.getByText('R$ 90,00')).toBeVisible()
      await expect(statement.getByText('R$ 425,00')).toBeVisible()
      await expect(statement.getByText('Em aberto')).toBeVisible()

      await selectOption(page, 'Forma de pagamento', 'Dinheiro')
      await statement.getByRole('button', { name: 'Registrar pagamento' }).click()

      await expect(statement.getByText(/Pago em .* · Dinheiro · por atendente/)).toBeVisible()
    })
  },
)
