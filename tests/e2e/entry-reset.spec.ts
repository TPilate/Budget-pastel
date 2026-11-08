import { test, expect } from '@playwright/test'

// Runs against the live database. Every test deletes the row it creates, in a finally.
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

async function openMouvements(page: any) {
  await page.goto('/mouvements')
  await page.waitForFunction(() => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__))
  await expect(page.locator('[data-testid="entry-loading"]')).toHaveCount(0, { timeout: 15_000 })
}

// The big amount display: the paragraph that holds the euro sign (income prefixes it with "+").
const amountDisplay = (page: any) => page.locator('p', { has: page.locator('span', { hasText: '€' }) }).first()

test('after saving an expense the form is empty and cannot be saved again', async ({ page }) => {
  await openMouvements(page)
  let createdId: string | undefined
  try {
    await typeAmount(page, '73')
    await page.getByPlaceholder('Monoprix').fill('E2E reset sortie')
    const posted = page.waitForResponse((r: any) => r.url().endsWith('/api/expenses') && r.request().method() === 'POST')
    await page.getByRole('button', { name: /^Enregistrer/ }).click()
    createdId = (await (await posted).json()).id

    await expect(amountDisplay(page)).toHaveText(/^0\s*€$/)
    await expect(page.getByPlaceholder('Monoprix')).toHaveValue('')
    await expect(page.getByRole('button', { name: /^Enregistrer/ })).toBeDisabled()
  } finally {
    if (createdId) expect([200, 404]).toContain((await page.request.delete(`/api/expenses/${createdId}`)).status())
  }
})

test('after saving an income the form is empty', async ({ page }) => {
  await openMouvements(page)
  let createdId: string | undefined
  try {
    await page.getByRole('button', { name: '+ Entrée' }).first().click()
    await typeAmount(page, '73')
    await page.getByPlaceholder('Coline — Airbnb').fill('E2E reset entrée')
    const posted = page.waitForResponse((r: any) => r.url().endsWith('/api/incomes') && r.request().method() === 'POST')
    await page.getByRole('button', { name: /^Enregistrer/ }).click()
    createdId = (await (await posted).json()).id

    await expect(amountDisplay(page)).toHaveText(/^\+\s*0\s*€$/)
    await expect(page.getByPlaceholder('Coline — Airbnb')).toHaveValue('')
    await expect(page.getByRole('button', { name: /^Enregistrer/ })).toBeDisabled()
  } finally {
    if (createdId) expect([200, 404]).toContain((await page.request.delete(`/api/incomes/${createdId}`)).status())
  }
})
