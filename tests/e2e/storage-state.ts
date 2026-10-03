import path from 'node:path'

// Lives in its own module because playwright.config.ts needs this path, and importing it
// from auth.setup.ts would make Playwright load that spec while parsing the config —
// calling setup() at config-load time throws.
export const STORAGE_STATE = path.join(process.cwd(), 'tests/e2e/.auth/user.json')
