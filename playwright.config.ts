import { defineConfig, devices } from '@playwright/test'
import { STORAGE_STATE } from './tests/e2e/storage-state'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      // Placeholder values so the Supabase client can construct in this test run
      // without a real project. getSession() reads local storage, not the network,
      // so no real/reachable Supabase backend is required for the redirect test.
      SUPABASE_URL: process.env.SUPABASE_URL ?? 'https://placeholder-test-project.supabase.co',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? 'placeholder-anon-key-for-tests',
    },
  },
  use: {
    baseURL: 'http://localhost:3000',
  },
  // Supabase rate-limits password grants: six concurrent logins returns 429 for four of
  // them, and a full run doing one grant per test tripped the limit even at two workers,
  // failing tests at the login step for reasons unrelated to what they tested. The setup
  // project logs in ONCE and every other spec reuses that session.
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
      // auth.spec.ts tests the login flow itself, so it must start signed out.
      testIgnore: /auth\.setup\.ts/,
    },
  ],
})
