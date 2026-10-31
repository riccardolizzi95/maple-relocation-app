# MAPLE PROJECT — fixed rules

> Translated from the Italian original. The day-by-day work log is condensed into the "Progress" summary
> below; the rules and the lessons learned are kept as they were.

## Stack (do not change)
- Next.js 16 (App Router) + TypeScript
- Supabase (Postgres + Auth + Storage)
- Tailwind CSS + shadcn/ui (Radix) + Lucide icons
- Deploy on Vercel (Git integration, auto-deploy on push)
- LLM calls ONLY from server-side API routes; API keys are never exposed to the client

## Cross-cutting rules
- Mobile-first and responsive. Modern, simple, clean look; restrained palette (white / soft red / warm greys).
- Supabase email/password auth, invite-only: login only, no public sign-up. Users are created by an admin.
- SHARED workspace for two users: both see the same data, not separate data per user. RLS lets any
  authenticated user read/write everything (deliberate choice for two trusted users), except per-user
  tables (preferences, push subscriptions) and the role column of `profiles`.
- All important data lives in Supabase; `localStorage` only as a temporary buffer (offline expense queue).
- After each module: STOP and wait for the owner's OK before moving on.
- After each completed module, BEFORE stopping: (1) update "## PROGRESS" below, (2) make a Git commit with a
  clear message. Always, no exceptions.
- Do NOT use screenshots, browser automation or screen capture: they kept failing and wasting tokens. The
  owner is the eyes when visual feedback is needed.
- Push to GitHub after every commit (Vercel deploys automatically). Initially pushes required an explicit OK;
  later the owner made them automatic.
- ALWAYS update "## PROGRESS" at the end of each block of work, so every new session picks up where the last
  one left off.
- Later in the project the owner gave a free hand to finish autonomously; owner verification only on the
  finished product, not at every step.
- Jobs module: shared workspace, but each application belongs to an owner (`profiles`), visible to both and
  filterable by person.
- TICKET CLOSURE: when working on a ticket, at the END always: (1) update the ticket in the DB (`tickets`
  table), writing in `resolution_note` the list of fixes/improvements in plain language for the user;
  (2) move it to status `da-verificare` ("to verify" — this fires a push notification to the author via a
  trigger); (3) explicitly ask the user for confirmation in chat. This also applies when working "live"
  without the exported ticket file. A ticket is never "resolved" without the to-verify step + confirmation.

## Rules learned along the way (keep applying them)
- Day-only dates: ALWAYS use `src/lib/dates.ts`. Never `toISOString().slice(0, 10)` (that is the UTC day)
  and never `new Date("YYYY-MM-DD")` (midnight UTC, shows the previous day west of Greenwich). Server code
  gets the user's time zone from the `tz` cookie (`src/lib/timezone-server.ts`), because Vercel runs in UTC.
- Money inputs: never `parseFloat`/`toFixed` while the user is typing; amount fields are always
  `type="text" inputMode="decimal"` with comma → dot normalisation.
- After any edit to `globals.css`, check the brace/nesting structure: once, every mobile rule ended up nested
  inside a `::-webkit-scrollbar` block and silently stopped applying.
- Never delete data rows while syncing child lists (contacts, interviews): update existing rows, insert new
  ones, delete removed ones ONLY if everything else succeeded, and never when the list failed to load.
- Show save errors in the modal; never fail silently. Optimistic updates roll back with a toast on failure.
- End-to-end tests run with a throwaway test user and then CLEAN UP — never delete real "Memory" knowledge
  sources during cleanup.
- Supabase edge logs are not complete: do not use them alone to claim "the request never arrived".
- Single sources of truth: expense categories in `src/components/budget/categories.ts`, job statuses in
  `src/components/jobs/status.ts`, splash sizes in `src/lib/splash-screens.json`.

## PROGRESS

### DONE (summary)
- Setup, DB schema with RLS + profile trigger + default checklist seed, private `documents` storage bucket,
  invite-only auth, layout (desktop sidebar, mobile bottom nav with up to 4 favourite sections, account drawer).
- Dashboard: departure countdown / days since arrival, checklist %, month spending, active applications,
  short-term-rental end date card.
- Checklist: CRUD, phases, filters, assignment, status cycling, swipe to complete/delete.
- Housing: CRUD, multiple contacts and typed dates, offer and contract terms, equivalent monthly cost
  (`src/lib/housing-cost.ts`), "fill from a listing" (server-side fetch with SSRF guards + LLM → JSON,
  fills only empty fields).
- Jobs: CRUD, list + board views, owner per application, multiple contacts and interviews, listing upload,
  status colours, grouping by application date, automatic "no response" after 40 days and a follow-up push
  reminder after 30 days (`src/lib/job-followup-rules.ts`, `src/lib/job-followups.ts`).
- Budget: expenses in two currencies with the official ECB rate of the expense day (frozen per expense,
  daily cron realigns the last 14 days), monthly budget = month override > sum of category caps > default,
  category caps with alerts, recurring expenses, receipts (client-side compression), products and price
  comparison per store with a product catalogue and automatic categorisation, CSV export, statistics
  (Recharts, lazy-loaded), runway estimate from savings and incomes, weekly summary push, display currency
  per user, offline queue with idempotent resend.
- Documents: private storage, signed URLs from a server route, editable categories, expiry alerts.
- Editable lookup values ("matchcodes") with rename propagation, managed in Settings.
- AI guide: streaming chat with a provider chain (fallbacks when a model is retired), RAG over uploaded
  knowledge, automatic per-person memory extraction with similarity de-duplication, optional web search.
- In-app ticketing: tickets with history (`ticket_events` filled by a SECURITY DEFINER trigger), to-verify /
  reopen flow, Markdown export for Claude, comments, deep links.
- Notifications: header bell (computed server-side, loaded client-side), Web Push with VAPID, push fired by a
  `pg_net` trigger on ticket status changes, daily deadline digest from the cron.
- User management page (admin only).
- Security hardening: granular RLS on `profiles` + trigger that forbids role changes from any client;
  SECURITY DEFINER functions revoked from `public`; fixed `search_path`.
- Performance: Vercel region next to the DB, `getUser()` de-duplicated with React `cache()`, notifications
  moved off the critical path, Suspense skeletons per page, immutable cache headers.
- PWA for iOS: manifest, icons, 12 startup images generated by `scripts/generate-splash.mjs`, service worker
  (static stale-while-revalidate, navigations network-first), safe areas, sticky header for iOS 26.
- Resilience: `src/lib/supabase/fetch-retry.ts` (retry on transient 401 PGRST303 after token refresh and on
  network errors; POSTs only when they certainly did not leave), login page recovers a valid session before
  asking for the password.
- DB migrated to a new Supabase region with schema/data verification by md5 fingerprints.
- Removed features: experimental receipt OCR (Cloudflare Worker + vision model) — removed at the owner's
  request; the legacy `/api/ai` route.
- Checks at every step: `tsc` ok, `eslint` 0 problems, `next build` ok.

### IN PROGRESS
- Performance: `router.refresh()` after every mutation (≈29 call sites) re-renders the whole server segment.
  Possible future optimisation; careful, in the shared workspace some refreshes are needed to see the other
  user's changes.

### TO DO
- Web search in chat needs a `TAVILY_API_KEY`; without it the UI shows "not configured".
- Leftovers: unused `AiConversation` type in `types.ts`; one orphan file in the storage bucket (to confirm
  with the owner). Note: files under `receipts/` are NOT orphans.
- Known limit: the notification id `tk:verify:<ticketId>` is static, so a dismissed notification does not
  come back if the same ticket is resolved again (needs a cycle marker).
- Proposed and not yet decided: pull-to-refresh in the PWA.

### DECISIONS
- Invite-only auth, no public sign-up. When creating a new Supabase project check that sign-up is disabled
  (`GET /auth/v1/settings` → `"disable_signup": true`): with "every authenticated user sees everything" RLS,
  open sign-up would expose all data.
- Supabase new key system: publishable key (= anon key) + secret key (= service role, server only).
- RLS with `auth.uid() IS NOT NULL` (not `auth.role()`).
- Credentials only in `.env.local`, never committed (`.env*` in `.gitignore`).
- Vercel Hobby plan: at most two crons (`/api/keepalive` daily, `/api/rates/daily` after the ECB publication).

## ROLLBACK

### Golden rule
ALWAYS commit every working change. Never leave work uncommitted. Make a "checkpoint" commit BEFORE risky
changes or large blocks.

### Discard uncommitted changes
```bash
git status
git diff
git checkout -- <file>        # one file
git checkout -- .             # EVERYTHING (irreversible)
```

### Go back to a previous commit (keeping history)
```bash
git log --oneline -10
git revert <hash>
```

### Go back and redeploy
Vercel deploys on push, so:
```bash
git revert <hash>
git push origin main
```
Several commits:
```bash
git revert --no-commit HEAD~3..HEAD
git commit -m "revert: back to <description>"
git push origin main
```

## RESUMING A SESSION
- Open Claude Code in the project folder (where this `CLAUDE.md` lives).
- First message: "Read CLAUDE.md and tell me where we are".
- Check `git status` and `git log --oneline -5` for the real state of the code.
- Update "## PROGRESS" at the end of every completed block of work.
- Dev server: `npm run dev`.
