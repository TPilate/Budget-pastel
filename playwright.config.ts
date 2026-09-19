import { defineConfig, devices } from '@playwright/test'

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
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
