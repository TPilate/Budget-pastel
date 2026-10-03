import { test, expect, type Page } from '@playwright/test'

// These tests edit the SAME live row (the first fixed charge) and assert on figures they
// read before editing it. Run in parallel they interleave — one test's edit becomes
// another's baseline, which is exactly how this suite first failed. They share a mutable
// fixture, so they run one at a time.
test.describe.configure({ mode: 'serial' })

const hasSeedCredentials = Boolean(process.env.SEED_USER_EMAIL)
  && Boolean(process.env.SEED_USER_PASSWORD)
  && Boolean(process.env.SUPABASE_URL)
  && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(() => {
  // The session comes from the setup project's single login; see tests/e2e/auth.setup.ts.
  test.skip(!hasSeedCredentials, 'Requires a real Supabase project and seed user')
})

/**
 * The page renders behind <Suspense> because of its top-level `await useFetch`, so the
 * inputs exist in the SSR markup before Vue attaches anything to them. Waiting for the app
 * — and for the hydration guard to release the field — avoids racing it.
 */
async function openComptes(page: Page) {
  await page.goto('/comptes')
  await expect(page.getByRole('heading', { name: 'Comptes' })).toBeVisible({ timeout: 15_000 })
  await page.waitForFunction(
    () => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__),
    undefined,
    { timeout: 20_000 },
  )
  await expect(page.getByLabel('Montant de la charge fixe').first()).toBeEnabled({ timeout: 10_000 })
}

test('a fixed charge amount can be edited, and the section total moves with it', async ({ page }) => {
  const before = await (await page.request.get('/api/accounts/overview')).json()
  expect(before.fixedCharges.lines.length).toBeGreaterThan(0)

  const target = before.fixedCharges.lines[0]
  const original = target.amount
  const next = original === 137 ? 142 : 137
  const expectedTotal = before.fixedCharges.total - original + next

  await openComptes(page)

  const field = page.getByLabel('Montant de la charge fixe').first()
  await field.fill(String(next))
  await field.blur()
  await expect(page.getByText('Enregistré').first()).toBeVisible({ timeout: 10_000 })

  // Re-read from the server: proves it persisted rather than only changing local state,
  // and that the header total was recomputed rather than left stale.
  const after = await (await page.request.get('/api/accounts/overview')).json()
  const updated = after.fixedCharges.lines.find((l: { id: string }) => l.id === target.id)
  expect(updated.amount).toBe(next)
  expect(after.fixedCharges.total).toBeCloseTo(expectedTotal, 2)

  // Restore, so re-running the suite does not drift the user's real figures.
  await page.request.patch(`/api/categories/${target.id}`, { data: { defaultTarget: original } })
  const restored = await (await page.request.get('/api/accounts/overview')).json()
  expect(restored.fixedCharges.lines.find((l: { id: string }) => l.id === target.id).amount).toBe(original)
  expect(restored.fixedCharges.total).toBeCloseTo(before.fixedCharges.total, 2)
})

test('an unchanged amount is not written back on blur', async ({ page }) => {
  await openComptes(page)

  // Clicking through the page must not fire a PATCH, or simply reading /comptes would
  // rewrite the user's figures and flash a save confirmation for no reason.
  let patchCount = 0
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().includes('/api/categories/')) patchCount++
  })

  const field = page.getByLabel('Montant de la charge fixe').first()
  await field.click()
  await field.blur()
  await page.waitForTimeout(1000)

  expect(patchCount).toBe(0)
  await expect(page.getByText('Enregistré')).toHaveCount(0)
})

test('a rejected amount is restored rather than left wrong on screen', async ({ page }) => {
  const before = await (await page.request.get('/api/accounts/overview')).json()
  const original = before.fixedCharges.lines[0].amount

  await openComptes(page)

  const field = page.getByLabel('Montant de la charge fixe').first()
  await field.fill('pas un nombre')
  await field.blur()

  await expect(page.getByText('Montant invalide')).toBeVisible({ timeout: 5_000 })
  // The field must snap back, so the screen never shows a figure the server does not hold.
  await expect(field).toHaveValue(String(original))

  const after = await (await page.request.get('/api/accounts/overview')).json()
  expect(after.fixedCharges.lines[0].amount).toBe(original)
})
