import { test, expect, type Page } from '@playwright/test'

const email = process.env.SEED_USER_EMAIL
const password = process.env.SEED_USER_PASSWORD
const hasRealSupabaseConfig = Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_ANON_KEY)

test.beforeEach(async ({ page }) => {
  test.skip(!email || !password || !hasRealSupabaseConfig, 'Requires a real Supabase project and seed user')
  await page.goto('/login')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Mot de passe').fill(password!)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')
})

/**
 * Opens the detail drawer for the first envelope row.
 *
 * The page has top-level `await useFetch` calls, so it renders behind <Suspense> and the
 * row's click handler is not attached until hydration finishes. Clicking before then does
 * nothing at all — verified: the drawer never opens and the page still has zero inputs.
 * So wait for the Vue app to exist before clicking, rather than racing it.
 */
async function openFirstEnvelopeDrawer(page: Page) {
  await page.goto('/enveloppes')
  await expect(page.getByRole('heading', { name: 'Enveloppes' })).toBeVisible({ timeout: 15_000 })
  await page.waitForFunction(
    () => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__),
    undefined,
    { timeout: 20_000 },
  )

  await page.getByRole('row').nth(1).click()
  // Assert on the form's own field, not on the text "Modifier": the page header already
  // contains a "Modifier les plafonds" link, and getByText matches substrings, so that
  // would pass even with the drawer shut.
  await expect(page.getByLabel('Plafond par défaut')).toBeVisible({ timeout: 10_000 })
}

test('an envelope can be edited from the drawer, and the change survives a reload', async ({ page }) => {
  const ledger = await (await page.request.get('/api/envelopes/ceilings')).json()
  expect(ledger.length).toBeGreaterThan(0)
  const target = ledger[0]
  const original = target.defaultCeiling

  // A value the envelope cannot already have, so a no-op save cannot pass by accident.
  const next = original === 137 ? 142 : 137

  await openFirstEnvelopeDrawer(page)

  const ceilingField = page.getByLabel('Plafond par défaut')
  await expect(ceilingField).toBeEnabled()   // the hydration guard must have released
  await ceilingField.fill(String(next))
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Enregistré')).toBeVisible({ timeout: 10_000 })

  // The real assertion: re-read from the server, proving the value was persisted rather
  // than only reflected in local component state.
  const after = await (await page.request.get('/api/envelopes/ceilings')).json()
  expect(after.find((row: { id: string }) => row.id === target.id).defaultCeiling).toBe(next)

  // Put it back, so re-running this suite does not drift the user's real data.
  await page.request.patch(`/api/envelopes/${target.id}`, { data: { defaultCeiling: original } })
  const restored = await (await page.request.get('/api/envelopes/ceilings')).json()
  expect(restored.find((row: { id: string }) => row.id === target.id).defaultCeiling).toBe(original)
})

test('the drawer renders light, not in the OS dark palette', async ({ page }) => {
  // Regression guard for the unreadable panel: @nuxt/ui pulls in @nuxtjs/color-mode, which
  // followed the system appearance, so USlideover — the only Nuxt UI component in the app —
  // flipped to a dark panel while its contents kept rendering dark-purple ink on top.
  await openFirstEnvelopeDrawer(page)

  await expect(page.locator('html')).not.toHaveClass(/dark/)

  // Read the colour actually painted behind the form by walking up to the nearest ancestor
  // with a non-transparent background. Asserting on a computed colour rather than a class
  // name keeps this honest if Nuxt UI's markup changes.
  const luminance = await page.getByLabel('Plafond par défaut').evaluate((input) => {
    let node: HTMLElement | null = input as HTMLElement
    while (node) {
      const bg = getComputedStyle(node).backgroundColor
      const parts = bg.match(/[\d.]+/g)?.map(Number)
      const opaque = parts && parts.length >= 3 && (parts[3] === undefined || parts[3] > 0)
      if (opaque) return (0.299 * parts[0] + 0.587 * parts[1] + 0.114 * parts[2]) / 255
      node = node.parentElement
    }
    return -1
  })

  expect(luminance).toBeGreaterThan(0.6)
})
