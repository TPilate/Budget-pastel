import { test, expect } from '@playwright/test'

const email = process.env.SEED_USER_EMAIL
const password = process.env.SEED_USER_PASSWORD
const hasRealSupabaseConfig = Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(async ({ page }) => {
  test.skip(!email || !password || !hasRealSupabaseConfig, 'Requires a real Supabase project and seed user')
  await page.goto('/login')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Mot de passe').fill(password!)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')
})

test('renders the three KPI cards and survives a reload', async ({ page }) => {
  await page.goto('/comptes')

  await expect(page.getByRole('heading', { name: 'Comptes' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Solde bancaire')).toBeVisible()
  await expect(page.getByText('Engagé par les enveloppes')).toBeVisible()
  await expect(page.getByText('Vraiment libre')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Comptes' })).toBeVisible({ timeout: 15_000 })
})

test('serves a coherent overview to a signed-in session', async ({ page }) => {
  const response = await page.request.get('/api/accounts/overview')
  expect(response.status()).toBe(200)

  const overview = await response.json()
  // The whole point of the three cards: free money is what is left after commitments.
  expect(overview.reallyFree).toBeCloseTo(overview.bankBalance - overview.committed, 2)
  expect(overview.fixedCharges.settledCount).toBeLessThanOrEqual(overview.fixedCharges.totalCount)
})

test('shows no bank-linking or synchronisation affordance', async ({ page }) => {
  await page.goto('/comptes')
  await expect(page.getByRole('heading', { name: 'Comptes' })).toBeVisible({ timeout: 15_000 })

  // Bank sync is explicitly out of scope; the page must not imply it exists.
  await expect(page.getByText('Relier un compte')).toHaveCount(0)
  await expect(page.getByText('Synchroniser')).toHaveCount(0)
  await expect(page.getByText('À pointer')).toHaveCount(0)
})
