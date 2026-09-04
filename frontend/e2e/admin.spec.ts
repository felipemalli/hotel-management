import { expect, test } from '@playwright/test'

import { ADMIN, login } from './support'

test.describe('admin · controles restritos', { tag: ['@RF8'] }, () => {
  test('atendente nao ve controle de escrita nem o chip', async ({ page }) => {
    await page.goto('/quartos')

    await expect(page.getByRole('button', { name: 'Novo quarto' })).toBeHidden()
    await expect(page.getByRole('columnheader', { name: 'Ações' })).toBeHidden()
    await expect(page.getByText('admin', { exact: true })).toBeHidden()

    await page.goto('/tarifas')
    await expect(page.getByRole('button', { name: 'Publicar nova tarifa' })).toBeHidden()
  })

  test.describe('como admin', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('admin ve o chip e os controles de escrita', async ({ page }) => {
      await login(page, ADMIN)

      await page.goto('/quartos')
      await expect(page.getByText('admin', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Novo quarto' })).toBeVisible()

      await page.getByRole('button', { name: 'Ações do quarto 201' }).click()
      const menu = page.getByRole('menu')
      await expect(menu.getByRole('menuitem', { name: 'Editar capacidade' })).toBeVisible()
      await expect(menu.getByRole('menuitem', { name: 'Desativar' })).toBeVisible()
      await page.keyboard.press('Escape')

      await page.goto('/tarifas')
      await expect(page.getByRole('button', { name: 'Publicar nova tarifa' })).toBeVisible()
    })
  })
})
