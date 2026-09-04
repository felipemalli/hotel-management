import { expect, test } from '@playwright/test'

import { selectFirstOption, uniqueDocument } from './support'

// Serial: cada passo depende do estado que o anterior deixou (o hóspede
// criado, a reserva criada, o check-in feito) — não faz sentido paralelizar.
test.describe.configure({ mode: 'serial' })

test.describe(
  'recepção · do cadastro ao checkout',
  { tag: ['@RF1', '@RF2', '@RF3', '@RF5', '@RF6', '@RF7', '@RN4', '@RN6'] },
  () => {
    const document = uniqueDocument()
    const guestName = `Hóspede E2E ${document}`

    test('cadastra o hóspede e cria a reserva', async ({ page }) => {
      await page.goto('/')

      await page.getByRole('button', { name: 'Novo hóspede' }).click()
      const guestDialog = page.getByRole('dialog', { name: 'Novo hóspede' })
      await guestDialog.getByLabel('Nome completo').fill(guestName)
      await guestDialog.getByLabel('Documento').fill(document)
      await guestDialog.getByLabel('Telefone').fill('+55 21 98888-0000')
      await selectFirstOption(page, 'Nacionalidade')
      await guestDialog.getByRole('button', { name: 'Cadastrar hóspede' }).click()

      const reservationDialog = page.getByRole('dialog', { name: 'Nova reserva' })
      await expect(reservationDialog).toBeVisible()
      await selectFirstOption(page, 'Quarto')
      await reservationDialog
        .getByRole('checkbox', { name: 'Utilizará vaga de estacionamento' })
        .click()
      await reservationDialog.getByRole('button', { name: 'Criar reserva' }).click()
      await expect(reservationDialog).toBeHidden()
    })

    test('encontra o hospede pela busca e faz o check-in', async ({ page }) => {
      await page.goto('/')

      await page.getByLabel('Buscar hóspede').fill(document)
      const allTable = page.getByRole('table', { name: 'Todos os hóspedes cadastrados' })
      await expect(allTable.getByText(guestName)).toBeVisible()

      await page.getByRole('tab', { name: 'Check-in pendente' }).click()
      const table = page.getByRole('table', {
        name: 'Hóspedes com reserva pendente de check-in',
      })
      await expect(table.getByText(guestName)).toBeVisible()

      const row = table.getByRole('row').filter({ hasText: guestName })
      await row.getByRole('button', { name: 'Check-in' }).click()

      const early = page.getByRole('alertdialog', { name: /^Check-in antes das/ })
      const inHotelTab = page.getByRole('tab', { name: 'No hotel' })
      await expect(early.or(inHotelTab)).toBeVisible()
      if (await early.isVisible()) {
        await early.getByRole('button', { name: 'Confirmar mesmo assim' }).click()
        await expect(early).toBeHidden()
      }
    })

    test('faz o checkout e confere o extrato', async ({ page }) => {
      await page.goto('/')

      await page.getByRole('tab', { name: 'No hotel' }).click()
      const table = page.getByRole('table', { name: 'Hóspedes no hotel' })
      const row = table.getByRole('row').filter({ hasText: guestName })
      await expect(row).toBeVisible()

      await row.getByRole('button', { name: 'Checkout' }).click()

      const statement = page.getByRole('dialog', { name: 'Extrato de checkout' })
      await expect(statement).toBeVisible()

      const dailyRows = statement.getByRole('table', { name: 'Diárias cobradas' }).getByRole('row')
      await expect(dailyRows).not.toHaveCount(0)

      await expect(statement.getByText('Subtotal diárias')).toBeVisible()
      await expect(statement.getByText('Subtotal vaga')).toBeVisible()
      await expect(statement.getByText('Total a pagar')).toBeVisible()

      const values = await statement.getByText(/^R\$ [\d.]+,\d{2}$/).allTextContents()
      expect(values.length).toBeGreaterThan(0)
      for (const value of values) expect(value).toMatch(/^R\$ [\d.]+,\d{2}$/)

      await expect(statement.getByText('Em aberto')).toBeVisible()
    })
  },
)
