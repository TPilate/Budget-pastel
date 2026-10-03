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
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Mot de passe').fill(password!)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  await page.context().storageState({ path: STORAGE_STATE })
})
