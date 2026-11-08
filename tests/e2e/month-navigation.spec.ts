import { test, expect, type Page } from '@playwright/test'

// Read-only: navigates and reads, never submits or writes.

const hasSeedCredentials = Boolean(process.env.SEED_USER_EMAIL) && Boolean(process.env.SEED_USER_PASSWORD)
  && Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(() => { test.skip(!hasSeedCredentials, 'Requires a real Supabase project and seed user') })

async function hydrated(page: Page) {
  await page.waitForFunction(() => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__), undefined, { timeout: 20_000 })
}

// A direct goto is server-rendered (no client data call to observe), so land on the home page
// and move with the router, like the perf spec does.
async function open(page: Page, path: string) {
  await page.goto('/')
  await hydrated(page)
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 15_000 })
  const loaded = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/pages/mouvements', { timeout: 30_000 })
  await page.evaluate((target) => (document.querySelector('#__nuxt') as any).__vue_app__.config.globalProperties.$router.push(target), path)
  const response = await loaded
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 15_000 })
  return response.json() as Promise<{ monthContext: { selected: { label: string }, latestClosed: { year: number, month: number } | null, current: { year: number, month: number }, firstDataMonth: { year: number, month: number } | null } }>
}

test('the selected month survives navigation and reload', async ({ page }) => {
  await open(page, '/mouvements')
  const previous = page.getByRole('button', { name: 'Mois précédent' })
  await expect(previous).toBeEnabled()
  const before = (await page.getByTestId('month-label').textContent())!.trim()
  await previous.click()
  await expect(page).toHaveURL(/mois=\d{4}-\d{2}/)
  // The label follows the page data, so wait for it to leave the current month.
  await expect(page.getByTestId('month-label')).not.toHaveText(before, { timeout: 15_000 })
  const label = (await page.getByTestId('month-label').textContent())!.trim()

  await page.locator('a[href^="/?mois="]').first().click()
  await expect(page).toHaveURL(/\/\?mois=\d{4}-\d{2}/)
  await expect(page.getByTestId('month-label')).toHaveText(label, { timeout: 15_000 })

  await page.reload()
  await hydrated(page)
  await expect(page.getByTestId('month-label')).toHaveText(label, { timeout: 15_000 })
})

test('a closed month shows the banner and no entry form', async ({ page }) => {
  const first = await open(page, '/mouvements')
  const closed = first.monthContext.latestClosed
  test.skip(!closed, 'No closed month in this database')
  const mois = `${closed!.year}-${String(closed!.month).padStart(2, '0')}`
  await open(page, `/mouvements?mois=${mois}`)

  await expect(page.getByText('est clôturé').first()).toBeVisible()
  await expect(page.getByText('saisie impossible')).toBeVisible()
  const panel = page.locator('div', { has: page.getByText('Nouvelle saisie', { exact: true }) }).last()
  await expect(panel.getByRole('button', { name: /Enregistrer|Ajouter|Valider/ })).toHaveCount(0)
  await expect(page.getByPlaceholder('Monoprix')).toHaveCount(0)
})

test('"Revenir au mois en cours" drops the parameter', async ({ page }) => {
  await open(page, '/mouvements')
  await page.getByRole('button', { name: 'Mois précédent' }).click()
  await expect(page).toHaveURL(/mois=/)
  await page.getByRole('button', { name: 'Revenir au mois en cours' }).click()
  await expect(page).not.toHaveURL(/mois=/)
  await expect(page.getByRole('button', { name: 'Revenir au mois en cours' })).toHaveCount(0)
})

test('two quick clicks on the previous arrow goes back two months', async ({ page }) => {
  const { monthContext } = await open(page, '/mouvements')
  const { current, firstDataMonth } = monthContext
  const index = (ym: { year: number, month: number }) => ym.year * 12 + ym.month
  test.skip(!firstDataMonth || index(current) - index(firstDataMonth) < 2, 'Needs two months with data before the current one')
  const target = index(current) - 2 - 1 // zero-based month index
  const expected = `${Math.floor(target / 12)}-${String((target % 12) + 1).padStart(2, '0')}`
  const arrow = page.getByRole('button', { name: 'Mois précédent' })
  await arrow.click({ noWaitAfter: true })
  await arrow.click({ noWaitAfter: true })
  await expect(page).toHaveURL(new RegExp(`mois=${expected}`))
})
