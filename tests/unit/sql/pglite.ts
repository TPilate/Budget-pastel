import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle', 'migrations')

/**
 * A real Postgres in memory with every migration applied, in journal order. Lets a test
 * exercise the hand-written SQL (close_month) that Drizzle does not manage.
 */
export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite()
  // Supabase provides these roles; the migrations GRANT/REVOKE against them.
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;')

  const journal = JSON.parse(readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string }[] }
  for (const { tag } of journal.entries) {
    const sql = readFileSync(join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint').map((part) => part.trim()).filter(Boolean)) {
      // PostgREST schema-cache reload: meaningless without PostgREST.
      if (/^NOTIFY\b/i.test(statement)) continue
      await db.exec(statement)
    }
  }
  return db
}
