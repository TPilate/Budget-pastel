import { test as setup, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { STORAGE_STATE } from './storage-state'

/**
 * Logs in once per run and saves the session for every other spec to reuse.
 *
 * Before this, each spec's beforeEach performed its own Supabase password grant — 21 of
 * them in about 25 seconds for a full run. Supabase rate-limits that: six concurrent
 * grants returns 429 for four of them, and even at two workers a full run still tripped
 * the limit intermittently, failing tests at the login step with no relation to what they
 * were actually testing. That was the "flaky suite" this project kept seeing.
 *
 * One grant per run stays comfortably inside the limit, and the suite gets faster as a
 * side effect. tests/e2e/auth.spec.ts deliberately opts out of this state, because the
 * login flow is the thing it tests.
 */
setup('authenticate once for the whole run', async ({ page }) => {
  const email = process.env.SEED_USER_EMAIL
  const password = process.env.SEED_USER_PASSWORD

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true })

  // Without a real project there is nothing to log into, but the file must still exist or
  // the chromium project fails to start rather than letting each spec skip on its own.
  if (!email || !password || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    fs.writeFileSync(STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }))
    return
  }

  await page.goto('/login')

  // The page renders behind <Suspense>, so its click handler is not attached until
  // hydration finishes; clicking before then does nothing at all. Wait for the Vue app
  // rather than racing it, as the other specs do.
  await page.waitForFunction(
    () => Boolean((document.querySelector('#__nuxt') as any)?.__vue_app__),
    undefined,
    { timeout: 20_000 },
  )

  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Mot de passe').fill(password!)
  await page.getByRole('button', { name: 'Se connecter' }).click()

  // 30s, not the 5s default. The password grant itself is fast, but the URL does not change
  // until the route commits, and a client-side navigation to `/` cannot commit until the
  // index page's async setup resolves — which means waiting on /api/dashboard, the heaviest
  // route in the app. On a dev server Playwright has just started, that first call also
  // pays for on-demand compilation. Instrumenting this showed the grant returning 200 and
  // the redirect completing correctly, only past the 5s mark: the assertion was racing a
  // cold server, not catching a broken login.
  await expect(page).toHaveURL('http://localhost:3000/', { timeout: 30_000 })

  await page.context().storageState({ path: STORAGE_STATE })
})
