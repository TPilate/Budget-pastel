import { test, expect } from '@playwright/test'

// This spec tests the login flow itself, so it must NOT reuse the shared signed-in
// session that every other spec gets from the setup project.
test.use({ storageState: { cookies: [], origins: [] } })

test('redirects an unauthenticated visitor to the login page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})

test('logs in with valid credentials and reaches the protected home page', async ({ page }) => {
  const email = process.env.SEED_USER_EMAIL
  const password = process.env.SEED_USER_PASSWORD
  const hasRealSupabaseConfig = Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_ANON_KEY)

  test.skip(!email || !password || !hasRealSupabaseConfig, 'SEED_USER_EMAIL, SEED_USER_PASSWORD, SUPABASE_URL, and SUPABASE_ANON_KEY must all be set (against a real Supabase project) to run this test')

  await page.goto('/login')

  // The page renders behind <Suspense>, so its click handler is not attached until
  // hydration finishes; clicking before then does nothing at all. Wait for the Vue app
  // rather than racing it, as tests/e2e/auth.setup.ts does for the same login form.
  await page.waitForFunction(
    () => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__),
    undefined,
    { timeout: 20_000 },
  )

  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Mot de passe').fill(password!)
  await page.getByRole('button', { name: 'Se connecter' }).click()

  // 30s, not the 5s default. The URL does not change until the route commits, and a
  // client-side navigation to `/` cannot commit until the index page's async setup
  // resolves /api/dashboard, the heaviest route in the app — which, on a cold dev server,
  // also pays for on-demand compilation. See tests/e2e/auth.setup.ts, which carries the
  // same fix: this test previously passed only because the setup project happens to warm
  // the server first.
  await expect(page).toHaveURL('http://localhost:3000/', { timeout: 30_000 })

  // The home page is now the dashboard (see tests/e2e/dashboard.spec.ts for the full
  // coverage of its content); this test only needs to confirm the authenticated
  // session actually reaches it, so it checks for a label that is always rendered,
  // income or not.
  await expect(page.getByText('Salaire reçu')).toBeVisible({ timeout: 15_000 })

  await page.reload()

  await expect(page).toHaveURL('http://localhost:3000/')
  await expect(page.getByText('Salaire reçu')).toBeVisible({ timeout: 15_000 })
})
