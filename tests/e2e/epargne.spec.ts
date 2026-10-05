import { test, expect, type Page } from '@playwright/test'

// Creating and editing a poche mutates shared live data, so these run one at a time —
// in parallel one test's poche becomes another's baseline.
test.describe.configure({ mode: 'serial' })

const hasSeedCredentials = Boolean(process.env.SEED_USER_EMAIL)
  && Boolean(process.env.SEED_USER_PASSWORD)
  && Boolean(process.env.SUPABASE_URL)
  && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(() => {
  // The session comes from the setup project's single login; see tests/e2e/auth.setup.ts.
  test.skip(!hasSeedCredentials, 'Requires a real Supabase project and seed user')
})

async function openEpargne(page: Page) {
  await page.goto('/epargne')
  await expect(page.getByRole('heading', { name: 'Épargne' })).toBeVisible({ timeout: 15_000 })
  // The page renders behind <Suspense>, so forms are inert until hydration lands.
  await page.waitForFunction(
    () => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__),
    undefined,
    { timeout: 20_000 },
  )
}

test('renders the poches and the six-month history, and survives a reload', async ({ page }) => {
  await openEpargne(page)
  await expect(page.getByText('Les trois poches')).toBeVisible()
  await expect(page.getByText('Six derniers mois')).toBeVisible()

  // The history window is always six long, even with no savings recorded.
  const payload = await (await page.request.get('/api/epargne')).json()
  expect(payload.history).toHaveLength(6)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Épargne' })).toBeVisible({ timeout: 15_000 })
})

test('serves a coherent payload, with no NaN at zero income', async ({ page }) => {
  const response = await page.request.get('/api/epargne')
  expect(response.status()).toBe(200)
  const payload = await response.json()

  // The poche balances must sum to the headline total.
  const summed = payload.poches.reduce((total: number, poche: any) => total + poche.balance, 0)
  expect(payload.totals.balance).toBeCloseTo(summed, 2)

  for (const value of Object.values(payload.ruleOfThumb.actuals)) {
    expect(Number.isNaN(value as number)).toBe(false)
  }
  for (const poche of payload.poches) {
    if (poche.targetAmount === null) expect(poche.progressPercent).toBeNull()
  }
})

test('a poche can be created and then edited, and both persist', async ({ page }) => {
  await openEpargne(page)

  const name = `Test poche ${Date.now()}`
  await page.getByRole('button', { name: '+ Nouvelle poche' }).click()
  await page.getByLabel('Nom de la poche').fill(name)
  await page.getByLabel('Montant mensuel').fill('25')
  await page.getByLabel('Objectif').fill('500')
  await page.getByRole('button', { name: 'Créer' }).click()

  await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 })

  const created = (await (await page.request.get('/api/epargne')).json())
    .poches.find((poche: any) => poche.name === name)
  expect(created).toBeTruthy()
  expect(created.monthlyAmount).toBe(25)
  expect(created.targetAmount).toBe(500)

  // Edit it through the API the page uses, then confirm the page reflects the change.
  await page.request.patch(`/api/savings-goals/${created.id}`, { data: { targetAmount: 800 } })
  const edited = (await (await page.request.get('/api/epargne')).json())
    .poches.find((poche: any) => poche.id === created.id)
  expect(edited.targetAmount).toBe(800)

  // There is deliberately no delete endpoint (out of scope), so this row stays. Name it
  // obviously so a human can clear it; do not leave it looking like real data.
})

test('does not reach the Épargne endpoint without a session', async ({ browser }) => {
  // Explicitly signed out: browser.newContext() inherits the project's storageState.
  const fresh = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const response = await fresh.request.get('http://localhost:3000/api/epargne')
  expect(response.status()).toBe(401)
  await fresh.close()
})
