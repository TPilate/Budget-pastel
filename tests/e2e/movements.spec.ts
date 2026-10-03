import { test, expect } from '@playwright/test'

// These tests exist to verify one thing the unit tests structurally cannot: that
// @supabase/ssr's createServerClient actually attaches the signed-in user's JWT to
// Data API requests. If it does not, RLS returns an empty array with NO error, so
// fetchMovements would happily produce an empty feed and the page would render blank
// while every unit test still passed.
//
// The reload case is deliberate. The original production symptom was "first load
// works, second load hangs forever" (a leaked Postgres pool connection), so a single
// successful load proves nothing about the bug this migration removes.

const hasSeedCredentials = Boolean(process.env.SEED_USER_EMAIL)
  && Boolean(process.env.SEED_USER_PASSWORD)
  && Boolean(process.env.SUPABASE_URL)
  && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(() => {
  // The session comes from the setup project's single login; see tests/e2e/auth.setup.ts.
  test.skip(!hasSeedCredentials, 'Requires a real Supabase project and seed user')
})

test('the authenticated session reaches the Data API through RLS', async ({ page }) => {
  // Pinned to the seed data's month (September 2026) via the explicit year/month query
  // params, rather than the current calendar month: the seed rows do not move, but the
  // system date does, and this test's only job is to catch a broken RLS/JWT path, not
  // to notice a new month.
  const response = await page.request.get('/api/movements?year=2026&month=9')

  expect(response.status()).toBe(200)
  const movements = await response.json()
  expect(Array.isArray(movements)).toBe(true)

  // The seeded database has expense_entries rows for September 2026. An empty array
  // here is the RLS/JWT failure this test is built to catch, not a pass.
  expect(movements.length).toBeGreaterThan(0)
  expect(movements[0]).toMatchObject({
    id: expect.any(String),
    type: expect.stringMatching(/^(expense|income|transfer)$/),
    label: expect.any(String),
    amount: expect.any(Number),
  })
})

test('the movements page loads, and still loads on reload', async ({ page }) => {
  await page.goto('/mouvements')
  await expect(page.getByRole('heading', { name: /mouvements/i })).toBeVisible({ timeout: 15_000 })

  // The reload is the actual regression guard: this is where the old pool-backed
  // implementation hung indefinitely.
  await page.reload()
  await expect(page.getByRole('heading', { name: /mouvements/i })).toBeVisible({ timeout: 15_000 })

  // And a third time, since the leak was cumulative across requests.
  await page.reload()
  await expect(page.getByRole('heading', { name: /mouvements/i })).toBeVisible({ timeout: 15_000 })
})

test('repeated concurrent requests all succeed', async ({ page }) => {
  // Six parallel requests would previously have been well past the pool ceiling.
  // Over stateless HTTPS there is no ceiling to hit.
  const responses = await Promise.all(
    Array.from({ length: 6 }, () => page.request.get('/api/movements')),
  )

  expect(responses.map((r) => r.status())).toEqual([200, 200, 200, 200, 200, 200])
})
