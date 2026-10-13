import { test, expect, type Page } from '@playwright/test'

// ⚠️ A closure is irreversible and this suite runs on the LIVE database. No test here may
// click "Confirmer la clôture" or POST a valid closure. Every interaction stops at the
// confirmation modal and cancels.

const hasSeedCredentials = Boolean(process.env.SEED_USER_EMAIL)
  && Boolean(process.env.SEED_USER_PASSWORD)
  && Boolean(process.env.SUPABASE_URL)
  && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(() => {
  test.skip(!hasSeedCredentials, 'Requires a real Supabase project and seed user')
})

async function openCompteRendu(page: Page) {
  await page.goto('/compte-rendu')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
  await page.waitForFunction(
    () => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__),
    undefined,
    { timeout: 20_000 },
  )
}

test('the status endpoint and the page agree on the closable month', async ({ page }) => {
  const status = await (await page.request.get('/api/closure/status')).json()
  const closure = await (await page.request.get('/api/closure')).json()
  expect(status.closableMonth?.month ?? null).toBe(closure.closable?.month ?? null)
  expect(status.closableMonth?.year ?? null).toBe(closure.closable?.year ?? null)
})

test('refuses a malformed closure and a month that is not closable, writing nothing', async ({ page }) => {
  const before = await (await page.request.get('/api/closure')).json()

  const malformed = await page.request.post('/api/closure', { data: { year: 2026, month: 13, decisions: [] } })
  expect(malformed.status()).toBe(400)

  // 2099 can never be the closable month, so this is refused before any write.
  const wrongMonth = await page.request.post('/api/closure', { data: { year: 2099, month: 1, decisions: [] } })
  expect(wrongMonth.status()).toBe(409)

  const after = await (await page.request.get('/api/closure')).json()
  expect(after.closable).toEqual(before.closable)
  expect(after.archives).toEqual(before.archives)
})

test('distributes leftovers up to the confirmation, then cancels without writing', async ({ page }) => {
  const before = await (await page.request.get('/api/closure')).json()
  await openCompteRendu(page)

  // Whether a month is closable depends on the real calendar and the real closures. Both
  // states are asserted; neither is skipped.
  if (!before.closable) {
    await expect(page.getByText('Rien à clôturer.')).toBeVisible()
    await expect(page.getByText(`Prochaine clôture possible le ${before.nextOpening.label}.`)).toBeVisible()
    return
  }

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Clôture de ${before.closable.label.toLowerCase()}`)
  const closeButton = page.getByRole('button', { name: `Clôturer et ouvrir ${before.closable.nextMonthName}` })
  const positive = before.envelopes.filter((e: any) => e.leftover > 0)

  if (positive.length > 0) {
    await expect(closeButton).toBeDisabled()
    await expect(page.getByTestId('tile-unassigned')).not.toHaveText('0 €')
    await page.getByRole('button', { name: 'Tout reporter' }).click()
  }
  // toHaveText, not toContainText: "260 €" contains "0 €".
  await expect(page.getByTestId('tile-unassigned')).toHaveText('0 €')
  await expect(closeButton).toBeEnabled()

  await closeButton.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Cette clôture est définitive')
  await dialog.getByRole('button', { name: 'Annuler' }).click()
  await expect(dialog).toBeHidden()

  const after = await (await page.request.get('/api/closure')).json()
  expect(after.closable).toEqual(before.closable)
  expect(after.archives).toEqual(before.archives)
})

test('choosing Épargne reveals the poche selector, pre-filled', async ({ page }) => {
  const before = await (await page.request.get('/api/closure')).json()
  const first = before.closable ? before.envelopes.find((e: any) => e.leftover > 0) : null
  await openCompteRendu(page)
  if (!first) {
    // Nothing to distribute: no row may offer a destination choice.
    await expect(page.getByRole('button', { name: 'Reporter', exact: true })).toHaveCount(0)
    return
  }

  const row = page.getByTestId(`row-${first.id}`)
  await row.getByRole('button', { name: 'Épargne' }).click()
  await expect(page.getByTestId(`goal-select-${first.id}`)).toHaveValue(before.defaultSavingsGoalId)

  await row.getByRole('button', { name: 'Enveloppe' }).click()
  await expect(page.getByTestId(`target-select-${first.id}`)).toBeVisible()
})
