import { test, expect } from '@playwright/test'

test('redirects an unauthenticated visitor to the login page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})

test('logs in with valid credentials and reaches the protected home page', async ({ page }) => {
  const email = process.env.SEED_USER_EMAIL
  const password = process.env.SEED_USER_PASSWORD

  test.skip(!email || !password, 'SEED_USER_EMAIL and SEED_USER_PASSWORD must be set to run this test')

  await page.goto('/login')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Mot de passe').fill(password!)
  await page.getByRole('button', { name: 'Se connecter' }).click()

  await expect(page).toHaveURL('http://localhost:3000/')
  await expect(page.getByText('Connecté')).toBeVisible()
})
