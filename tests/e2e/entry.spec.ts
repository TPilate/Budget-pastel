import { test, expect } from '@playwright/test'

test('records an expense through the entry sheet', async ({ page }) => {
  const email = process.env.SEED_USER_EMAIL
  const password = process.env.SEED_USER_PASSWORD
  const hasRealSupabaseConfig = Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_ANON_KEY)

  test.skip(!email || !password || !hasRealSupabaseConfig, 'SEED_USER_EMAIL, SEED_USER_PASSWORD, SUPABASE_URL, and SUPABASE_ANON_KEY must all be set (against a real, seeded Supabase project with reference data loaded) to run this test')

  await page.goto('/login')
  // Nuxt dev mode serves unbundled ESM and hydrates client-side after `load`
  // fires; without waiting for the client bundle to settle, this click can
  // race hydration and fall back to a native (unhandled) form submission.
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Mot de passe').fill(password!)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  await page.getByRole('button', { name: '+' }).click()
  await expect(page.getByText('Nouvelle ligne')).toBeVisible()

  await page.getByRole('button', { name: '6' }).click()
  await page.getByRole('button', { name: '2' }).click()
  await page.getByRole('button', { name: ',' }).click()
  await page.getByRole('button', { name: '4' }).click()
  await page.getByRole('button', { name: '0' }).click()

  // The server-side expense schema (shared/schemas/expenseEntry.ts) requires a
  // non-empty label, so a label must be filled before submitting against a real
  // backend, or POST /api/expenses responds 500 (Zod validation error).
  await page.getByPlaceholder('Monoprix').fill('Courses de test')

  await page.getByText("Enregistrer la sortie").click()

  await expect(page.getByText('Nouvelle ligne')).not.toBeVisible()
})

test('adds a category from the Paramètres page', async ({ page }) => {
  const email = process.env.SEED_USER_EMAIL
  const password = process.env.SEED_USER_PASSWORD
  const hasRealSupabaseConfig = Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_ANON_KEY)

  test.skip(!email || !password || !hasRealSupabaseConfig, 'SEED_USER_EMAIL, SEED_USER_PASSWORD, SUPABASE_URL, and SUPABASE_ANON_KEY must all be set to run this test')

  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Mot de passe').fill(password!)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  // Navigate via the bottom-nav link (client-side) rather than page.goto(),
  // which would force a full SSR reload: app/pages/plus/parametres.vue loads
  // its reference data with bare `$fetch` calls (not `useFetch`), which are
  // not cookie-forwarded during SSR and 401 on a hard navigation while
  // authenticated. A NuxtLink click is how a real user reaches this page from
  // the bottom nav and does not hit that SSR-only edge case.
  await page.getByRole('link', { name: 'Plus' }).click()
  await expect(page).toHaveURL('http://localhost:3000/plus/parametres')
  await page.waitForLoadState('networkidle')
  await page.getByPlaceholder('🛒').fill('🧪')
  await page.getByPlaceholder('Nouvelle catégorie').fill('Test E2E')
  await page.getByRole('button', { name: 'Ajouter' }).first().click()

  await expect(page.getByText('🧪 Test E2E')).toBeVisible()
})
