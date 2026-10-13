# Handoff — where this project stands

**Last updated:** 2026-10-13, at commit `d6817d7` on `main` (pushed to `origin`).

This file is the "pick up on another computer" summary. Everything below is verified against
the repository as of that commit, not recalled from memory.

---

## 1. Getting running on a new machine

```bash
git clone git@github.com:TPilate/Budget-pastel.git
cd Budget-pastel
npm install          # postinstall runs `nuxt prepare`
npm run dev          # http://localhost:3000
```

Built with Node **v24.18.0** and npm **11.16.0**. Nuxt 4.5, Nitro 2.13, Vue 3.5, Vite 8.

**`.env` does not travel — it is gitignored, and nothing works without it.** Copy it across
by hand (or rebuild it from the Supabase dashboard). It needs these keys, and the file in the
repo's history carries long explanatory comments for each:

| Key | Where it comes from |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | same page; used **only** by `scripts/seed-user.ts` |
| `DATABASE_URL` | Project Settings → Database → connection string |
| `DB_PASSWORD` | the same credential, broken out |
| `SEED_USER_EMAIL`, `SEED_USER_PASSWORD` | the seeded household login |

**`DATABASE_URL` must use the Session pooler on port 5432, never the Transaction pooler on
6543.** This is not a preference. The transaction pooler hangs *indefinitely with no error*
once the app's concurrent `Promise.all` query batches exceed a small in-flight count, which
is what caused the original infinite-loading bug on the home page. Measured: the same
61-query concurrent batch that never returns on 6543 completes in ~280 ms on 5432.

## 2. Commands

```bash
npm run dev                  # dev server
npm run build                # production build (run this before believing anything works)
npm test                     # vitest — currently 200 passing across 25 files
npm run test:e2e             # playwright — currently 26 passing
npm run db:generate          # drizzle-kit generate (migrations)
npm run db:migrate           # drizzle-kit migrate
npm run seed:user            # one-off, creates the household user
npm run seed:reference-data  # one-off, seeds categories/envelopes/accounts/poches
```

`npm run test:e2e` runs against the **live Supabase database** and a real dev server
(Playwright starts one itself, reusing an existing one if port 3000 is busy). It writes real
rows. See §5.

## 3. What is built

Seven of eight sidebar entries have pages. All of them are French-facing.

| Route | State |
|---|---|
| `/login` | Done. Had a three-round hydration bug; see §4. |
| `/` Tableau de bord | Done — KPIs, 50/30/20 donut, entry forms |
| `/parametres` | Done — all reference tables |
| `/enveloppes` | Done — ceilings, journal, detail drawer, inline editing |
| `/mouvements` | Done — unified feed |
| `/envies` | Done — wishlist by size |
| `/comptes` | Done — accounts, fixed charges with editable amounts |
| `/epargne` | **Done, most recent milestone** — poches with inline editing, six-month history, 50/30/20 + gap advice, month contributions, sidebar total |
| `/compte-rendu` | **NOT BUILT.** The sidebar links to it, so clicking it 404s today. |

### The Épargne milestone (just finished)

Spec `docs/superpowers/specs/2026-10-03-epargne-design.md`, plan
`docs/superpowers/plans/2026-10-03-epargne.md`. Five tasks, each reviewed, plus a final
whole-branch review and two fix waves. Files worth knowing:

- `server/utils/domain/savings.ts` — pure logic: `summarisePoches`, `monthlyHistory`,
  `savingsGapAdvice`, `monthsOfChargesCovered`, `monthContributions`
- `server/utils/epargneQuery.ts` + `server/api/epargne.get.ts` — the read side, entirely on
  the Supabase Data API (see §4 on the pool)
- `server/api/savings-goals/` — create and edit a poche
- `app/pages/epargne.vue` + `app/components/PocheEditForm.vue`
- `shared/schemas/savingsGoal.ts`

Note the three real poches currently have `target_amount: null` and `monthly_amount: 0`, so
the page shows no progress bars yet. That is the honest empty state, not a bug — set them
through the page's own edit form.

## 4. Things that will bite you (read before touching the server)

**Never run `drizzle-kit push`.** The Drizzle schema files do not record row-level security,
but the live database *has* RLS enabled on all 17 tables via the hand-written
`drizzle/migrations/0002_enable_rls.sql`. A push computes that as drift and silently
disables it, which would re-open a hole where the whole database was readable and writable
through the public Data API with just the anon key. Generate migrations; never push.

**The connection pool is the project's main hazard.** `server/utils/db.ts` sets `max: 12`,
and postgres.js's pool-wait queue has **no timeout** — a request that cannot get a slot waits
forever rather than erroring, which is why a page once hung indefinitely instead of showing
an error. `connect_timeout` and `statement_timeout` do not cover waiting for a slot; only
`withDbTimeout` does. As of `d6817d7` there are **no unwrapped pool calls left in
`server/`** — keep it that way. `/api/dashboard` and `/api/accounts/overview` each hold up
to 5 slots, and `SidebarCeilingsWidget` costs another 5 on every page render, so the margin
is thin. New routes should follow `/api/epargne` and stay entirely on the Supabase Data API.

**Hydration discards early input.** The pages use top-level `await useFetch`, so they render
behind `<Suspense>` and Vue patches inputs to match empty refs when hydration lands,
throwing away anything typed before then. Every form therefore carries an `isHydrated` guard
(set in `onMounted`) plus `isSubmitting`. The login page lost three debugging rounds to this
before the cause was found. E2E specs wait for `#__nuxt.__vue_app__` before interacting, and
even that only proves the app exists, not that a given row's click handler is attached — the
envelope drawer helper retries its click for that reason.

**Amounts are text.** Every amount comes from a text input, so server schemas use
`z.coerce.number()` and forms normalise a French decimal comma with
`.trim().replace(',', '.')`. A missed normalisation turns `"1,50"` into `NaN` and 400s; this
has happened twice. Money renders only through `formatEuro` / `formatEuroShort` (and
`formatNumber`) in `app/utils/currency.ts` — never hand-rolled `Intl.NumberFormat`.

**Tests that pass while asserting nothing** are this repo's recurring failure. Four real
cases so far: a `getByText('Modifier')` that substring-matched an unrelated "Modifier les
plafonds" link; a drawer test that passed with the drawer shut; an assertion that re-derived
the exact reduce it was checking; and — worst — the whole E2E suite skipping because env vars
were unset while still exiting green. Treat a weakened assertion as a real defect.

## 5. E2E leaves residue in the live database

`tests/e2e/epargne.spec.ts` creates a real poche and a savings entry, because there is
deliberately no delete endpoint. It neutralises them in a `finally` — entry zeroed, poche set
to `monthlyAmount: 0` / `targetAmount: null`, renamed with a `zz-e2e-` prefix — so the
figures do not drift. **But neutralised is not invisible: the row still renders on
`/epargne`, and one accumulates per run.**

After an E2E run, delete rows named `zz-e2e-…` by hand (entries first, for the foreign key).
The live database was left clean at `d6817d7`: three real poches, zero savings entries.

The proper fix is in the follow-ups file — an `archived_at` column on `savings_goals`, which
is the only reference table without one.

## 6. Suggested next step

The parent spec (`docs/superpowers/specs/2026-09-19-budget-planner-pwa-design.md` §12) puts
the month closure flow next, and it is also the last unbuilt page:

> **Milestone 5 — `/compte-rendu`:** month closure flow + PDF report generation + archive +
> scheduled email.

Two deliberate omissions elsewhere are waiting on it, and should be picked up with it: the
dashboard's `Clôturer le mois` button and the Épargne page's `Reliquats de clôture` row were
both left out rather than rendered as permanently-pending UI.

Also unbuilt and, unlike the above, **undesigned**: livrets. `livrets`,
`livret_contributions` and `livret_yearly_history` exist in the schema with 0 rows, no
endpoints and no UI. The parent spec's milestone 4 says "+ Livrets", but the Figma file has
no livret screen at all, so building one means inventing it. That is a decision to make
deliberately, not an oversight.

## 7. Open follow-ups

`docs/superpowers/notes/2026-10-05-epargne-follow-ups.md` is the current list, with enough
detail to act on each without re-deriving it. Headlines:

- An empty `PATCH` body returns 500 instead of 400 on three endpoints; the fix belongs in
  `server/utils/referenceCrud.ts` so all three benefit.
- Five sibling create endpoints (envelopes, categories, accounts, income types, wishlist)
  share a missing `sort_order`, so newly created rows tie at 0 and list order is unstable
  between renders. Only the savings-goal endpoint was fixed.
- `savings_goals` needs an `archived_at` column (see §5) — it would also let a poche be
  retired from the UI.
- Four smaller items, each with its reasoning for being parked.

Earlier notes: `2026-09-27-envies-comptes-follow-ups.md`,
`2026-10-03-dashboard-follow-ups.md`, `2026-09-21-vercel-dashboard-hang.md`.

## 8. How this project has been worked

Each milestone runs: `superpowers:brainstorming` → a spec in `docs/superpowers/specs/` →
`superpowers:writing-plans` → a plan in `docs/superpowers/plans/` →
`superpowers:subagent-driven-development` (a fresh subagent per task, a review after each,
then a whole-branch review). Work goes directly onto `main`, by choice.

SDD scratch lives in `.superpowers/`, which is gitignored and therefore **will not be on the
new machine** — that is fine, it is per-plan scratch and the finished milestone's workspace
was deleted. The specs, plans and follow-up notes under `docs/` are the durable record.
