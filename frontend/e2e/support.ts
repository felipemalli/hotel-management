import type { Page } from '@playwright/test'

export const ATTENDANT = { username: 'atendente', password: 'atendente123' }
export const ADMIN = { username: 'admin', password: 'admin123' }

export async function login(
  page: Page,
  credentials: { username: string; password: string } = ATTENDANT,
) {
  await page.goto('/login')
  await page.getByLabel('Usuário').fill(credentials.username)
  await page.getByLabel('Senha').fill(credentials.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.getByRole('tablist', { name: 'Listagens de hóspedes' }).waitFor()
}

// Documento único por execução: um repetido colidiria com `DUPLICATE_DOCUMENT`.
export function uniqueDocument(): string {
  return `E2E${Date.now()}`
}

export async function selectOption(page: Page, comboboxName: string, optionName: string | RegExp) {
  await page.getByRole('combobox', { name: comboboxName }).click()
  await page.getByRole('option', { name: optionName }).click()
}

export async function selectFirstOption(page: Page, comboboxName: string) {
  await page.getByRole('combobox', { name: comboboxName }).click()
  await page.getByRole('option').first().click()
}
