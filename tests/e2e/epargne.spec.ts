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

  // Cross-endpoint coherence, not a tautology: the previous version of this test summed
  // poches.balance and compared it to totals.balance, but server/utils/domain/savings.ts
  // computes totalBalance with that exact reduce, so the check held for any input at all
  // (including an empty poches array). /api/accounts/overview derives fixedCharges.total
  // from the same categories table independently, so checking monthsOfChargesCovered
  // against it exercises a real integration between two endpoints instead.
  const overview = await (await page.request.get('/api/accounts/overview')).json()
  if (overview.fixedCharges.total > 0) {
    const expectedMonths = Math.round((payload.totals.balance / overview.fixedCharges.total) * 10) / 10
    expect(payload.totals.monthsOfChargesCovered).toBeCloseTo(expectedMonths, 5)
  }
  else {
    expect(payload.totals.monthsOfChargesCovered).toBeNull()
  }

  for (const value of Object.values(payload.ruleOfThumb.actuals)) {
    expect(Number.isNaN(value as number)).toBe(false)
  }
  for (const poche of payload.poches) {
    if (poche.targetAmount === null) expect(poche.progressPercent).toBeNull()
  }
})

test('a poche can be created and edited through its own form, moving the progress bar', async ({ page }) => {
  await openEpargne(page)

  const name = `Test poche ${Date.now()}`
  await page.getByRole('button', { name: '+ Nouvelle poche' }).click()
  await page.getByLabel('Nom de la poche').fill(name)
  await page.getByLabel('Montant mensuel').fill('25')
  await page.getByLabel('Objectif').fill('500')
  await page.getByRole('button', { name: 'Créer' }).click()

  const row = page.locator('li').filter({ hasText: name })
  await expect(row).toBeVisible({ timeout: 10_000 })

  const payload = await (await page.request.get('/api/epargne')).json()
  const created = payload.poches.find((poche: any) => poche.name === name)

  // No delete endpoint exists for a poche (deliberately out of scope), so everything this
  // test seeds — the poche itself and its savings entry — must be neutralised before the
  // test ends, or re-running this suite leaves permanent residue in the live database (see
  // enveloppes.spec.ts and comptes-edit.spec.ts, which restore what they touch for the same
  // reason). try/finally so the cleanup still runs if an assertion fails partway — that
  // failure mode is exactly how residue accumulated before.
  //
  // The try opens HERE, before the first assertion about the created poche rather than
  // after it. The row already exists in the database by this point: it was created through
  // the real form above. Asserting on it outside the try would leave it behind on any
  // failure, which is the very thing this block exists to prevent.
  try {
    expect(created).toBeTruthy()
    expect(created.monthlyAmount).toBe(25)
    expect(created.targetAmount).toBe(500)

    // Give the poche a real balance: freshly created, it has none, and moving its objective
    // against a zero balance would leave the progress bar at 0 % either way, proving nothing.
    await page.request.post('/api/savings', {
      data: { savingsGoalId: created.id, year: payload.month.year, month: payload.month.month, amount: 300 },
    })
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Épargne' })).toBeVisible({ timeout: 15_000 })
    await page.waitForFunction(
      () => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__),
      undefined,
      { timeout: 20_000 },
    )
    const reloadedRow = page.locator('li').filter({ hasText: name })

    // Open the poche's own edit form through its real control — the component this task
    // exists to build — rather than bypassing it with a direct API call. A PATCH request
    // alone would give the hydration guard, the comma normalisation and the submit/error UI
    // zero browser coverage, which is exactly the "test passes while asserting nothing real"
    // pattern this repo has shipped before (a substring-matched link, a drawer test that
    // passed with the drawer shut).
    await reloadedRow.getByRole('button', { name }).click()
    const objectifField = reloadedRow.getByLabel('Objectif')
    // A field this form owns, not arbitrary text that could match elsewhere on the page —
    // proves the form actually opened.
    await expect(objectifField).toBeVisible({ timeout: 10_000 })
    // Enabled, not just present: a regression in the isHydrated guard must fail this test
    // rather than being silently raced by `fill`.
    await expect(objectifField).toBeEnabled()

    const barBefore = await reloadedRow.locator('.bg-mint-bar').getAttribute('style')

    // French decimal comma, exercised end to end through the real input and submit button:
    // this normalisation has 400'd the server twice and nothing before this covered it in
    // a browser.
    await objectifField.fill('800,50')
    await reloadedRow.getByRole('button', { name: 'Enregistrer' }).click()
    // The form now stays open after a successful save and shows its own confirmation
    // (the parent no longer closes it — see app/pages/epargne.vue's onPocheSaved), so that
    // confirmation, not the field disappearing, is the signal the round trip finished.
    await expect(reloadedRow.getByText('Enregistré')).toBeVisible({ timeout: 10_000 })

    // Poll rather than read once. The confirmation appearing means the save round trip
    // finished, but the parent's refresh repaints the bar a moment later, so a single
    // immediate read catches the pre-refresh width and compares it against itself. The
    // assertion is still the real one — the bar must actually move, from balance/500 to
    // balance/800.50 — just not raced.
    await expect
      .poll(() => reloadedRow.locator('.bg-mint-bar').getAttribute('style'), { timeout: 10_000 })
      .not.toBe(barBefore)

    // Server-side re-read proves this persisted rather than only updating local state.
    const edited = (await (await page.request.get('/api/epargne')).json())
      .poches.find((poche: any) => poche.id === created.id)
    expect(edited.targetAmount).toBe(800.5)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Épargne' })).toBeVisible({ timeout: 15_000 })
  }
  finally {
    // Neutralise rather than delete: zero the seeded savings entry (POST /api/savings
    // upserts on goal/year/month, so re-posting amount: 0 overwrites the 300 € this test
    // wrote), zero the poche's monthly contribution and clear its target so it cannot
    // contribute to the page's headline figures, and rename it so a human scanning the
    // list sees immediately that it is test residue rather than a real poche.
    //
    // Re-resolve the id instead of trusting `created`: if the lookup above returned nothing,
    // dereferencing it here would throw a TypeError that masks the real assertion failure
    // AND still leave the row behind. The form did create it, so find it by name.
    const goalId = created?.id ?? (await (await page.request.get('/api/savings-goals')).json())
      .find((goal: any) => goal.name === name)?.id

    if (goalId) {
      await page.request.post('/api/savings', {
        data: { savingsGoalId: goalId, year: payload.month.year, month: payload.month.month, amount: 0 },
      })
      await page.request.patch(`/api/savings-goals/${goalId}`, {
        data: { name: `zz-e2e-${name}`, monthlyAmount: 0, targetAmount: null },
      })
    }
  }
})

test('does not reach the Épargne endpoint without a session', async ({ browser }) => {
  // Explicitly signed out: browser.newContext() inherits the project's storageState.
  const fresh = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const response = await fresh.request.get('http://localhost:3000/api/epargne')
  expect(response.status()).toBe(401)
  await fresh.close()
})
