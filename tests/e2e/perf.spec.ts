import { test, expect, type Page } from '@playwright/test'

// Read-only: navigates and reads, never submits. Safe to run against production with
//   PERF_BASE_URL=https://budget-pastel.vercel.app npx playwright test tests/e2e/perf.spec.ts

const hasSeedCredentials = Boolean(process.env.SEED_USER_EMAIL) && Boolean(process.env.SEED_USER_PASSWORD)
  && Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_ANON_KEY)

test.describe.configure({ mode: 'serial' })
test.beforeEach(() => { test.skip(!hasSeedCredentials, 'Requires a real Supabase project and seed user') })

const PAGES = [
  { path: '/mouvements', call: '/api/pages/mouvements' },
  { path: '/enveloppes', call: '/api/pages/enveloppes' },
  { path: '/epargne', call: '/api/epargne' },
  { path: '/comptes', call: '/api/accounts/overview' },
  { path: '/envies', call: '/api/pages/envies' },
  { path: '/parametres', call: '/api/pages/parametres' },
  { path: '/compte-rendu', call: '/api/closure' },
]
// Production gets the spec's target; a local dev server compiles on demand, so it gets a
// looser bound that still catches a return of the request chain.
const NAV_BUDGET_MS = process.env.PERF_BASE_URL ? 400 : 1000

async function openHome(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__), undefined, { timeout: 20_000 })
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 15_000 })
}

function apiCallsDuring(page: Page) {
  const calls: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    // The sidebar's ceilings are loaded once per visit, not per navigation.
    if (path.startsWith('/api/') && path !== '/api/envelopes/ceilings') calls.push(path)
  })
  return calls
}

test('warm up every page once (dev compiles on first visit; production warms the function)', async ({ page }) => {
  await openHome(page)
  for (const { path } of PAGES) {
    await page.locator(`a[href="${path}"]`).first().click()
    await page.waitForURL(`**${path}`)
    await expect(page.getByRole('status')).toHaveCount(0, { timeout: 15_000 })
  }
})

for (const { path, call } of PAGES) {
  test(`navigating to ${path} costs one call, no session re-check, and shows data within budget`, async ({ page }) => {
    await openHome(page)
    const calls = apiCallsDuring(page)

    const started = Date.now()
    // Wait for the page's own call first: right after the route changes the old page can still
    // be on screen (no skeleton yet), so "no status element" alone would pass too early.
    const dataLoaded = page.waitForResponse((response) => new URL(response.url()).pathname === call, { timeout: 15_000 })
    await page.locator(`a[href="${path}"]`).first().click()
    await page.waitForURL(`**${path}`)
    await dataLoaded
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('status')).toHaveCount(0, { timeout: 15_000 })
    const elapsed = Date.now() - started
    console.log(`[perf] ${path}: ${elapsed} ms`)

    expect(calls).toEqual([call])
    expect(calls).not.toContain('/api/health')
    expect(elapsed).toBeLessThan(NAV_BUDGET_MS)
  })
}

test('the page renders before its data arrives', async ({ page }) => {
  await openHome(page)
  // Hold the data call for 2 s: the title and skeleton must show well before it returns.
  await page.route('**/api/pages/parametres', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    await route.continue()
  })
  const started = Date.now()
  await page.locator('a[href="/parametres"]').first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeVisible()
  await expect(page.getByRole('status')).toBeVisible()
  expect(Date.now() - started).toBeLessThan(1500)
})

test('entry forms stay hidden until their lists arrive', async ({ page }) => {
  await openHome(page)
  await page.route('**/api/pages/mouvements', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    await route.continue()
  })
  await page.locator('a[href="/mouvements"]').first().click()
  await expect(page.getByTestId('entry-loading')).toBeVisible()
  await expect(page.getByTestId('entry-loading')).toBeHidden({ timeout: 15_000 })
})

test('a failing page call shows the error banner instead of an endless skeleton', async ({ page }) => {
  await openHome(page)
  await page.route('**/api/pages/envies', (route) => route.fulfill({ status: 500, body: '{}' }))
  await page.locator('a[href="/envies"]').first().click()
  await expect(page.getByText(/Impossible de charger/)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('status')).toHaveCount(0)
})

test('a 401 on a page call re-checks the session', async ({ page }) => {
  await openHome(page)
  const healthChecks: string[] = []
  page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/health') healthChecks.push(request.url()) })
  await page.route('**/api/pages/parametres', (route) => route.fulfill({ status: 401, body: '{}' }), { times: 1 })
  await page.locator('a[href="/parametres"]').first().click()
  await expect.poll(() => healthChecks.length, { timeout: 10_000 }).toBeGreaterThan(0)
})
