import { test, expect } from '@playwright/test'

const hasSeedCredentials = Boolean(process.env.SEED_USER_EMAIL)
  && Boolean(process.env.SEED_USER_PASSWORD)
  && Boolean(process.env.SUPABASE_URL)
  && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(() => {
  // The session comes from the setup project's single login; see tests/e2e/auth.setup.ts.
  test.skip(!hasSeedCredentials, 'Requires a real Supabase project and seed user')
})

test('renders the three size columns and survives a reload', async ({ page }) => {
  await page.goto('/envies')

  await expect(page.getByRole('heading', { name: 'Envies' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Petites')).toBeVisible()
  await expect(page.getByText('Moyennes')).toBeVisible()
  await expect(page.getByText('Grosses')).toBeVisible()

  // The priority tally from the design, rendered on the page rather than in the
  // shared sidebar.
  await expect(page.getByText('Priorités')).toBeVisible()

  // The reload is the regression guard: it is where pool exhaustion used to surface.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Envies' })).toBeVisible({ timeout: 15_000 })
})

test('serves the wishlist endpoint to a signed-in session', async ({ page }) => {
  const response = await page.request.get('/api/wishlist')
  expect(response.status()).toBe(200)
  expect(Array.isArray(await response.json())).toBe(true)
})

test('does not reach the wishlist endpoint without a session', async ({ browser }) => {
  // Explicitly signed out: browser.newContext() inherits the project's storageState, so
  // without this it would carry the shared session and get 200 instead of 401.
  const fresh = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const response = await fresh.request.get('http://localhost:3000/api/wishlist')
  expect(response.status()).toBe(401)
  await fresh.close()
})
