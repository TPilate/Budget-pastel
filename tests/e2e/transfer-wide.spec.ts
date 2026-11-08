import { test, expect } from '@playwright/test'

// Runs against the live database. Creates its own account and transfer and removes both in a finally.
const hasSeedCredentials = Boolean(process.env.SEED_USER_EMAIL)
  && Boolean(process.env.SEED_USER_PASSWORD)
  && Boolean(process.env.SUPABASE_URL)
  && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(() => {
  test.skip(!hasSeedCredentials, 'Requires a real Supabase project and seed user')
})

async function typeAmount(page: any, digits: string) {
  for (const digit of digits) await page.getByRole('button', { name: digit, exact: true }).click()
}

test('Budget du mois → an account shows in the feed and raises the account balance', async ({ page }) => {
  const mouvements = await (await page.request.get('/api/pages/mouvements')).json()
  test.skip(
    mouvements.budgetLibre === null || mouvements.budgetLibre < 1,
    `Budget libre is ${mouvements.budgetLibre}: at least 1 € is needed to move from Budget du mois`,
  )

  const created = await page.request.post('/api/accounts', { data: { name: 'zz-e2e-livret', emoji: '🧪', kind: 'epargne' } })
  expect(created.status()).toBe(200)
  const account = await created.json()
  let transferId: string | undefined

  const balanceOf = async () => {
    const overview = await (await page.request.get('/api/accounts/overview')).json()
    return overview.accounts.find((a: any) => a.id === account.id).balance as number
  }

  try {
    const before = await balanceOf()

    await page.goto('/mouvements')
    await page.waitForFunction(() => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__))
    await expect(page.locator('[data-testid="entry-loading"]')).toHaveCount(0, { timeout: 15_000 })

    await page.getByRole('button', { name: '⇄ Transfert' }).first().click()
    await expect(page.getByText('Entre le budget, les enveloppes et les comptes')).toBeVisible()
    await page.locator('select:has(option[value="budget"])').nth(1).selectOption(`account:${account.id}`)
    await typeAmount(page, '1')
    await page.getByPlaceholder("Dîner d'anniversaire").fill('E2E solde')

    const posted = page.waitForResponse((r: any) => r.url().endsWith('/api/transfers') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Valider le transfert' }).click()
    const response = await posted
    expect(response.status()).toBe(200)
    transferId = (await response.json()).id

    await expect(page.getByText(/Transfert Budget du mois → .*zz-e2e-livret/).first()).toBeVisible({ timeout: 15_000 })
    expect(await balanceOf()).toBeCloseTo(before + 1, 2)
  } finally {
    if (transferId) expect([200, 404]).toContain((await page.request.delete(`/api/transfers/${transferId}`)).status())
    expect((await page.request.patch(`/api/accounts/${account.id}`, { data: { archivedAt: new Date().toISOString() } })).status()).toBe(200)
  }
})
