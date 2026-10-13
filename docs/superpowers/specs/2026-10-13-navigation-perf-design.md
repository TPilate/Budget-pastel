# Navigation performance — Design Spec

**Date:** 2026-10-13
**Context:** measured on production (`https://budget-pastel.vercel.app`) and on a local production build, 2026-10-13. Measurement scripts were throwaway and are not in the repo.

## 1. Goal

Make moving around the app feel immediate: a click shows the new page at once, its data
follows in a single round trip, and opening the app after a pause is markedly faster.
The household reported `/mouvements` as slow; it is the worst case of a pattern every
page shares.

## 2. What was measured

| Cause | Evidence | Felt as |
|---|---|---|
| Cold start of the Vercel function | First request after idle: TTFB **2.8 s**, page ready **3.8 s** (`/mouvements`); spikes of 1.8 s on `/api/dashboard`, 2.2 s on `/` | Opening the app is slow |
| Serial request chain on every navigation | The global middleware calls `/api/health` first, then pages fetch one after another: Mouvements 3 hops (≈ 420 ms warm), Paramètres **5 hops** (450–630 ms), Envies 3 | The old page stays frozen until the last hop |
| Session check per API call | `requireUser` → Supabase Auth round trip, ≈ 60–90 ms, paid by **every** call including `/api/health` | Every hop pays it again |
| No feedback | 0.3–0.6 s warm (up to 4 s cold) with nothing moving after a click | The app looks stuck |

Warm, each API call is fast (85–250 ms). The database is not the problem; the number of
serial hops and cold starts are.

## 3. Decisions

| Question | Decision | Why |
|---|---|---|
| How to remove the serial chain | **One endpoint per page** (approach A) | The only option that brings every navigation to one round trip, one session check and at most one cold start. Parallelising existing calls (B) keeps one auth check and one possible cold start per call; a client cache (C) risks showing stale budget figures after an entry. |
| Scope | All four causes in one milestone | They interlock: fewer hops, immediate render, lighter cold start, and tests that keep it that way. |
| Client cache between pages | **None** | A budget must never show stale figures; each visit refetches its single call. |
| Keep-warm pinger | **Deferred**, only if §6.1–6.2 are not enough once measured | It masks the problem rather than fixing it, and it is an external service. |

## 4. Server: one call per page

### 4.1 Page endpoints

| Page | Today (client navigation) | After |
|---|---|---|
| Tableau de bord | dashboard + savings-goals + closure/status | `GET /api/pages/dashboard` |
| Mouvements | movements + entry-reference-data | `GET /api/pages/mouvements` |
| Enveloppes | envelopes/ceilings + envelopes/reserves | `GET /api/pages/enveloppes` |
| Envies | wishlist + envelopes | `GET /api/pages/envies` |
| Paramètres | categories + envelopes + income-types + accounts | `GET /api/pages/parametres` |
| Épargne, Comptes, Compte rendu | already one call | unchanged |

Each page endpoint:
- calls `requireUser` **once**;
- runs all its reads **in parallel** through the Supabase Data API, each under
  `AbortSignal.timeout(10000)`, logging and throwing a 500 on any failure — never partial data;
- returns one object whose fields keep **exactly the shapes the page consumes today**
  (e.g. `/api/pages/parametres` returns `{ categories, envelopes, incomeTypes, accounts }`
  with the same camelCase row shapes `listActiveRows` returns now), so page templates
  change only where they read the data from;
- reuses the existing query modules (`fetchMovements`, `fetchWishlist`, …); no logic is duplicated.

Existing GET endpoints stay for anything else that uses them (forms, the envelope
journal, targeted refreshes). Write endpoints are untouched.

### 4.2 Off the connection pool

Combining pool-backed reads in one request would hold many of the pool's 12 slots at
once and recreate the original hang. So:

- **Envelope ledgers move to the Data API.** `listBudgetEnvelopeLedgers` (today 5 pool
  slots per call, used by `/api/envelopes/ceilings`, the dashboard and the sidebar on
  every render) is reimplemented on the Data API with the same `BudgetEnvelopeLedger`
  output, built on the same pure `computeEnvelopeLedger` and `deriveEnvelopeSubtitle`.
  It gains an `event` parameter. All callers switch to it.
- **Reference lists read through the Data API** in the page endpoints that need them
  (Mouvements' entry forms, Envies, Paramètres), mapped to the same camelCase shapes.
- **Savings goals** (dashboard) read through the Data API.
- What stays on the pool: the dashboard's remaining query and the reserve balances. No
  page endpoint combines two pool-heavy reads.

### 4.3 Sidebar widget

`SidebarCeilingsWidget` keeps its own call to `/api/envelopes/ceilings` (now Data API),
made non-blocking. It is fetched once per visit under the shared key
`envelope-ceilings`; the Mouvements entry panel reuses that data instead of fetching
it again.

### 4.4 Session checks

- The global middleware checks `/api/health` **only on the first load** of the app
  (server render, or the first client render when there is none). Client-side
  navigations no longer call it.
- A global response interceptor sends any **401** from `/api/*` to `/login`, so an
  expired session is still caught on the next call.
- Security is unchanged: every endpoint still runs `requireUser` server-side.

## 5. Client: render at once

- Pages switch to **`useLazyFetch`** on their single key (`page-dashboard`,
  `page-mouvements`, `page-enveloppes`, `page-envies`, `page-parametres`, and the
  existing keys of the three single-call pages). On a click the new page renders
  immediately with its title and layout; data fills in after one call. On a hard load
  the server render still arrives filled.
- This removes the pages' top-level `await useFetch`, which `docs/HANDOFF.md` §4 names
  as the cause of hydration discarding early input. The `isHydrated` / `isSubmitting`
  guards stay.
- **`PageSkeleton`**: one component, blocks in `toggle-track` / `app-bg` shaped like the
  page's cards (KPI row, list, right column), with a gentle pulse. No full-screen spinner.
- Errors: each page's existing `warn` banner shows if its single call fails; the
  skeleton then hides.
- After an entry, a page refreshes **its own key** plus `envelope-ceilings`. Paramètres
  refreshes once instead of its four separate lists.
- **`NuxtLoadingIndicator`** (thin bar, `primary` colour) acknowledges every click.

## 6. Cold start

### 6.1 Lighter function (code)

- `pdfkit`, `fontkit` and the font loading are imported **lazily** (`await import(...)`)
  inside `GET /api/reports/[year]/[month]` only, so no other route pays for them at
  start-up.
- Measured, not assumed: compare the size of the Vercel function bundle and its cold
  start before and after, with `NITRO_PRESET=vercel npm run build` and a cold request
  against a deployment.

### 6.2 Vercel settings (the household's action, with instructions)

- Enable **Fluid compute** on the project (*Settings → Functions*).
- Check that the function region (`vercel.json` pins `fra1`) matches the Supabase
  project's region; align them if not.

### 6.3 Keep-warm (deferred)

A scheduled ping of `/api/health` every 5–10 minutes (e.g. a GitHub Actions workflow),
added only if, after §6.1–6.2, opening the app after a pause is still slow.

## 7. Testing

### 7.1 Performance E2E (kept): `tests/e2e/perf.spec.ts`

Structural assertions first, because they are stable across machines:
- From the dashboard, clicking each sidebar link triggers **at most one** `/api/*`
  request (the sidebar ceilings, already loaded, do not count), and **never**
  `/api/health`.
- The new page's `<h1>` is visible **before** its data request completes (the page no
  longer waits on its data to render).
- Loose time bound to catch real regressions: warm client navigation to data shown
  under **1 s**.
- `PERF_BASE_URL` runs the same spec read-only against production; the target there is
  **under 400 ms** warm, recorded before and after this milestone.

### 7.2 Unit (vitest)

- Each page endpoint: `requireUser` called once; importing `server/utils/db` fails the
  suite (except the dashboard, which asserts it calls only its existing pool query);
  all reads start before any resolves (parallel).
- Data API envelope ledgers: on one fixture, the new implementation returns **exactly**
  the ceilings, net spent, remaining and subtitles the pool implementation returns,
  asserted against hard-coded values.
- Reference-list mapping: Data API rows map to the same camelCase shape as
  `listActiveRows`.
- Middleware: no `/api/health` call on client navigation, one on first load. The 401
  interceptor redirects to `/login`.

### 7.3 Unchanged

Every existing functional E2E (entries, envelopes, Épargne, Compte rendu, …) stays green.
No Data API request without its 10 s timeout. No page endpoint combines two pool-heavy reads.

## 8. Out of scope

- Client-side caching or prefetch on hover.
- Moving the dashboard's own query off the pool beyond the envelope ledgers (§4.2).
- Mobile layout; scheduled email; editing or deleting movements (tracked separately).
