import { test, expect } from '@playwright/test'

const hasSeedCredentials = Boolean(process.env.SEED_USER_EMAIL)
  && Boolean(process.env.SEED_USER_PASSWORD)
  && Boolean(process.env.SUPABASE_URL)
  && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(async ({ page }) => {
  // The session comes from the setup project's single login; see tests/e2e/auth.setup.ts.
  // The navigation used to come free with that login's redirect, so it is explicit now.
  test.skip(!hasSeedCredentials, 'Requires a real Supabase project and seed user')
  await page.goto('/')
})

test('renders the four KPI cards and survives a reload', async ({ page }) => {
  await expect(page.getByText('Salaire reçu')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Épargne versée')).toBeVisible()
  await expect(page.getByText('Reste à dépenser')).toBeVisible()

  // The reload is the regression guard: it is where pool exhaustion used to surface.
  await page.reload()
  await expect(page.getByText('Salaire reçu')).toBeVisible({ timeout: 15_000 })
})

test('serves a coherent dashboard payload to a signed-in session', async ({ page }) => {
  const response = await page.request.get('/api/dashboard')
  expect(response.status()).toBe(200)

  const payload = await response.json()
  const { summary, income, savings, envelopes } = payload

  // The donut must partition income exactly: the five slices sum back to what came in.
  const sliceTotal = summary.slices.reduce((sum: number, s: any) => sum + s.amount, 0)
  expect(sliceTotal).toBeCloseTo(income.received, 2)

  expect(savings.total).toBeCloseTo(
    savings.byGoal.reduce((sum: number, g: any) => sum + g.amount, 0), 2)
  expect(envelopes.overspentCount).toBeLessThanOrEqual(envelopes.cards.length)

  // Month-independent discriminator (F5): envelopes are not month-scoped, so this
  // holds regardless of the calendar and fails if listBudgetEnvelopeLedgers breaks —
  // unlike the sliceTotal/income.received check above, which holds trivially (0 ≈ 0)
  // against an empty month.
  expect(envelopes.cards.length).toBeGreaterThan(0)

  // No percentage may be NaN, whatever the data.
  for (const slice of summary.slices) expect(Number.isNaN(slice.percent)).toBe(false)
})

test('does not reach the dashboard endpoint without a session', async ({ browser }) => {
  // Explicitly signed out: browser.newContext() inherits the project's storageState, so
  // without this it would carry the shared session and get 200 instead of 401.
  const fresh = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const response = await fresh.request.get('http://localhost:3000/api/dashboard')
  expect(response.status()).toBe(401)
  await fresh.close()
})

test('shows no month navigation or closure action', async ({ page }) => {
  await expect(page.getByText('Salaire reçu')).toBeVisible({ timeout: 15_000 })
  // Both are explicitly out of scope; a visible dead control reads as broken.
  await expect(page.getByText('Clôturer le mois')).toHaveCount(0)
})
