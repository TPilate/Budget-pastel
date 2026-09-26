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

const email = process.env.SEED_USER_EMAIL
const password = process.env.SEED_USER_PASSWORD
const hasRealSupabaseConfig = Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(async ({ page }) => {
  test.skip(
    !email || !password || !hasRealSupabaseConfig,
    'SEED_USER_EMAIL, SEED_USER_PASSWORD, SUPABASE_URL and SUPABASE_ANON_KEY must all be set against a real Supabase project',
  )

  await page.goto('/login')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Mot de passe').fill(password!)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')
})

test('the authenticated session reaches the Data API through RLS', async ({ page }) => {
  const response = await page.request.get('/api/movements')

  expect(response.status()).toBe(200)
  const movements = await response.json()
  expect(Array.isArray(movements)).toBe(true)

  // The seeded database has expense_entries rows for the current month. An empty
  // array here is the RLS/JWT failure this test is built to catch, not a pass.
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
