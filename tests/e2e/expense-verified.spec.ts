import { test, expect } from '@playwright/test'

// Runs against the live database and needs migration 0008 (expense_entries.verified_at).
// Deletes the row it creates, in a finally.
const hasSeedCredentials = Boolean(process.env.SEED_USER_EMAIL)
  && Boolean(process.env.SEED_USER_PASSWORD)
  && Boolean(process.env.SUPABASE_URL)
  && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(() => {
  test.skip(!hasSeedCredentials, 'Requires a real Supabase project and seed user')
})

const pad = (n: number) => String(n).padStart(2, '0')
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function openMouvements(page: any) {
  await page.goto('/mouvements')
  await page.waitForFunction(() => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__))
  await expect(page.getByRole('heading', { name: /mouvements/i })).toBeVisible({ timeout: 15_000 })
  await page.waitForLoadState('networkidle')
}

const counterText = (page: any) => page.getByText(/sorties? à vérifier|Toutes les sorties sont vérifiées/)
async function counter(page: any): Promise<number> {
  const text = (await counterText(page).first().textContent()) ?? ''
  return Number(text.match(/^\s*(\d+)/)?.[1] ?? 0)
}

test('ticking an expense survives a reload and updates the counter', async ({ page }) => {
  const reference = (await (await page.request.get('/api/pages/mouvements')).json()).reference
  const envelope = reference.envelopes[0]
  const response = await page.request.post('/api/expenses', {
    data: { date: today(), categoryId: null, label: 'E2E ticket', amount: 1, envelopeId: envelope.id, financedBy: 'budget' },
  })
  expect(response.status()).toBe(200)
  const created = await response.json()
  try {
    await openMouvements(page)
    const before = await counter(page)
    expect(before).toBeGreaterThanOrEqual(1)

    const box = page.getByRole('checkbox', { name: 'Vérifié avec le ticket — E2E ticket' })
    await box.check()
    await expect(box).toBeChecked()
    await expect.poll(() => counter(page)).toBe(before - 1)

    await openMouvements(page)
    await expect(page.getByRole('checkbox', { name: 'Vérifié avec le ticket — E2E ticket' })).toBeChecked()
    await page.getByRole('button', { name: 'À vérifier' }).click()
    await expect(page.locator('tr', { hasText: 'E2E ticket' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Tous', exact: true }).click()
    await page.getByRole('checkbox', { name: 'Vérifié avec le ticket — E2E ticket' }).uncheck()
    await expect.poll(() => counter(page)).toBe(before)
  } finally {
    expect([200, 404]).toContain((await page.request.delete(`/api/expenses/${created.id}`)).status())
  }
})
