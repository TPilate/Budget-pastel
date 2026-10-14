import { test, expect } from '@playwright/test'

// Runs against the live database. Every test deletes what it created through the new
// DELETE routes, so a run leaves no rows behind (unlike entry.spec.ts).
const hasSeedCredentials = Boolean(process.env.SEED_USER_EMAIL)
  && Boolean(process.env.SEED_USER_PASSWORD)
  && Boolean(process.env.SUPABASE_URL)
  && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(() => {
  test.skip(!hasSeedCredentials, 'Requires a real Supabase project and seed user')
})

// Local date, like the feed shows it (toISOString would be the UTC date).
const pad = (n: number) => String(n).padStart(2, '0')
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
// dd/mm, as the Mouvements table prints dates.
const todayLabel = () => today().slice(8, 10) + '/' + today().slice(5, 7)

async function typeAmount(page: any, digits: string) {
  for (const digit of digits) await page.getByRole('button', { name: digit, exact: true }).click()
}

// Matches the digits only (euro formatting adds a narrow no-break space before the sign), and
// not as the tail of a bigger amount such as 17,00.
const amountText = (digits: string) => new RegExp(String.raw`(^|[^\d])${digits}(?!\d)`)

test('a salary income shows in "Salaire reçu"', async ({ page }) => {
  const parametres = await (await page.request.get('/api/pages/parametres')).json()
  const salaryType = parametres.incomeTypes.find((type: any) => type.isSalary)
  test.skip(!salaryType, 'No income type is flagged as salary yet')

  const before = (await (await page.request.get('/api/pages/dashboard')).json()).dashboard.income.salaryReceived
  const now = new Date()
  const created = await (await page.request.post('/api/incomes', {
    data: { incomeTypeId: salaryType.id, label: 'E2E salaire', amount: 1, dateReceived: today(), monthAssigned: now.getMonth() + 1, yearAssigned: now.getFullYear() },
  })).json()

  try {
    const after = (await (await page.request.get('/api/pages/dashboard')).json()).dashboard.income.salaryReceived
    expect(after).toBeCloseTo(before + 1)
  } finally {
    expect((await page.request.delete(`/api/incomes/${created.id}`)).status()).toBe(200)
  }
})

test('an expense can come out of an envelope with no category', async ({ page }) => {
  const reference = (await (await page.request.get('/api/pages/mouvements')).json()).reference
  const envelope = reference.envelopes.find((e: any) => e.kind === 'budget')
  const response = await page.request.post('/api/expenses', {
    data: { date: today(), categoryId: null, label: 'E2E enveloppe seule', amount: 1, envelopeId: envelope.id, financedBy: 'budget' },
  })
  expect(response.status()).toBe(200)
  const created = await response.json()
  try {
    expect(created.categoryId).toBeNull()
  } finally {
    expect((await page.request.delete(`/api/expenses/${created.id}`)).status()).toBe(200)
  }
})

test('savings from the Épargne tab appear in Mouvements, then can be edited and deleted', async ({ page }) => {
  await page.goto('/mouvements')
  await expect(page.getByRole('heading', { name: /mouvements/i })).toBeVisible({ timeout: 15_000 })
  await page.waitForLoadState('networkidle')

  const savingsRow = (digits: string) => page.locator('tr', { hasText: 'Épargne —' })
    .filter({ hasText: todayLabel() }).filter({ hasText: amountText(digits) })

  // Improbable amounts, checked absent first, so the test can only ever touch its own row.
  await expect(savingsRow('71,00')).toHaveCount(0)
  await expect(savingsRow('713,00')).toHaveCount(0)

  let createdId: string | undefined
  try {
    await page.getByRole('button', { name: '🐷 Épargne' }).first().click()
    await typeAmount(page, '71')
    const posted = page.waitForResponse((r) => r.url().endsWith('/api/savings') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Enregistrer le versement' }).click()
    createdId = (await (await posted).json()).id

    const row = savingsRow('71,00')
    await expect(row).toHaveCount(1, { timeout: 15_000 })

    // Edit: 71 -> 713
    await row.click()
    const drawer = page.getByRole('dialog')
    await drawer.getByRole('button', { name: '3', exact: true }).click()
    await drawer.getByRole('button', { name: 'Enregistrer les modifications' }).click()
    const edited = savingsRow('713,00')
    await expect(edited).toHaveCount(1, { timeout: 15_000 })

    // Delete, with the inline confirmation.
    await edited.click()
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Oui' }).click()
    await expect(savingsRow('713,00')).toHaveCount(0, { timeout: 15_000 })
  } finally {
    // Safety net if the UI flow stopped early; a 404 means the UI delete already worked.
    if (createdId) {
      const status = (await page.request.delete(`/api/savings/${createdId}`)).status()
      expect([200, 404]).toContain(status)
    }
  }
})
