import { test as setup } from '@playwright/test'

import { login } from './support'

const AUTH_FILE = 'e2e/.auth/atendente.json'

setup('autentica o atendente uma vez para os specs autenticados', async ({ page }) => {
  await login(page)
  await page.context().storageState({ path: AUTH_FILE })
})
