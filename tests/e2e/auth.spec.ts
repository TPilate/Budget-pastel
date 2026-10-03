import { test, expect } from '@playwright/test'

// This spec tests the login flow itself, so it must NOT reuse the shared signed-in
// session that every other spec gets from the setup project.
test.use({ storageState: { cookies: [], origins: [] } })

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

  // The home page is now the dashboard (see tests/e2e/dashboard.spec.ts for the full
  // coverage of its content); this test only needs to confirm the authenticated
  // session actually reaches it, so it checks for a label that is always rendered,
  // income or not.
  await expect(page).toHaveURL('http://localhost:3000/')
  await expect(page.getByText('Salaire reçu')).toBeVisible({ timeout: 15_000 })

  await page.reload()

  await expect(page).toHaveURL('http://localhost:3000/')
  await expect(page.getByText('Salaire reçu')).toBeVisible({ timeout: 15_000 })
})
