import { expect, test } from '@playwright/test'

import { ATTENDANT, login } from './support'

test.describe('login', { tag: ['@RF8'] }, () => {
  test('redireciona o anonimo para o login e devolve a recepcao apos entrar', async ({ page }) => {
    await page.goto('/reservas/1')
    await expect(page).toHaveURL(/\/login$/)

    await page.getByLabel('Usuário').fill(ATTENDANT.username)
    await page.getByLabel('Senha').fill('senha-errada')
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page.getByRole('alert')).toHaveText('Usuário ou senha inválidos.')

    await page.getByLabel('Senha').fill(ATTENDANT.password)
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page.getByRole('tablist', { name: 'Listagens de hóspedes' })).toBeVisible()
  })

  test('nao deixa credencial alcancavel por script', async ({ page, context }) => {
    await login(page)

    expect(await page.evaluate<string>('document.cookie')).not.toContain('hotel_refresh')

    const { origins, cookies } = await context.storageState()
    expect(origins).toEqual([])

    const refresh = cookies.find((cookie) => cookie.name === 'hotel_refresh')
    expect(refresh?.httpOnly).toBe(true)
    expect(refresh?.path).toBe('/api/auth/')
  })
})
