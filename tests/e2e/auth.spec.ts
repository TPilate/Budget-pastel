import { test, expect } from '@playwright/test'

test('redirects an unauthenticated visitor to the login page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})

test('logs in with valid credentials and reaches the protected home page', async ({ page }) => {
  const email = process.env.SEED_USER_EMAIL
  const password = process.env.SEED_USER_PASSWORD
  const hasRealSupabaseConfig = Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_ANON_KEY)

  test.skip(!email || !password || !hasRealSupabaseConfig, 'SEED_USER_EMAIL, SEED_USER_PASSWORD, SUPABASE_URL, and SUPABASE_ANON_KEY must all be set (against a real Supabase project) to run this test')

  await page.goto('/login')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Mot de passe').fill(password!)
  await page.getByRole('button', { name: 'Se connecter' }).click()

  await expect(page).toHaveURL('http://localhost:3000/')
  await expect(page.getByRole('link', { name: 'Tableau de bord' })).toBeVisible()

  await page.reload()

  await expect(page).toHaveURL('http://localhost:3000/')
  await expect(page.getByRole('link', { name: 'Tableau de bord' })).toBeVisible()
})
