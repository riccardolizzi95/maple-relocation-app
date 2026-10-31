# Maple — relocation organizer

A mobile-first web app (installable as an iOS PWA) that helps two people organize a move abroad in one
shared workspace: **checklist, housing search, job applications, budget and documents**, plus an AI guide
that answers practical questions with the household's own notes as context.

> The UI and code comments are in Italian (the app was built for Italian-speaking users); this README and
> `CLAUDE.md` are in English.

## What it does

| Section | Highlights |
|---|---|
| Dashboard | Countdown to departure, checklist progress, month spending, active applications, upcoming deadlines |
| Checklist | Tasks by phase, assignment, swipe to complete/delete |
| Housing | Listings with contacts, dates, offer and contract terms; equivalent monthly cost; "fill from a listing" (server-side fetch with SSRF guards → LLM → JSON) |
| Jobs | Applications per person, list and board views, interviews and contacts, automatic "no response" status and follow-up reminders |
| Budget | Two-currency expenses with the official ECB rate of the expense day, category caps and alerts, recurring expenses, receipts, per-store product price comparison, statistics, runway estimate, offline queue |
| Documents | Private storage, signed URLs from a server route, expiry alerts |
| AI guide | Streaming chat with a provider fallback chain, RAG over uploaded knowledge, automatic per-person memory |
| Tickets | In-app bug/feature tickets with history, a "to verify" flow and Markdown export for Claude Code |
| Notifications | Header bell + Web Push (VAPID), pushes fired by a Postgres trigger via `pg_net`, daily digest cron |

## Stack

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
- Supabase: Postgres with RLS, Auth (invite-only), Storage, `pgvector`, `pg_net` triggers
- Tailwind CSS 4 + shadcn/ui (Radix) + Lucide icons, Recharts (lazy-loaded)
- LLMs through OpenAI-compatible endpoints (Groq, NVIDIA NIM), called only from server routes
- Vercel (hosting + two crons), Web Push

## Getting started

```bash
npm install
cp .env.example .env.local      # fill in your Supabase project and keys
npm run dev                     # http://localhost:3000
```

Database: `supabase/migrations/` holds the full schema (tables, RLS policies, triggers, functions, storage
bucket) and `supabase/seed.sql` the initial generic data (default checklist, editable lists). With the
Supabase CLI: `supabase link` then `supabase db push`; or run the files in order in the SQL editor, then
`seed.sql`. Before using push notifications for tickets, set your deployment URL in `notify_ticket_push()`
(`supabase/migrations/20261006134932_push_security_recurring.sql`). Requires the `vector` and `pg_net`
extensions (both available on Supabase).

Users are invite-only: create them in the Supabase dashboard and disable public sign-up.

## Checks

There is no automated test suite in this project. The checks run at every step were:

```bash
npx tsc --noEmit   # type check
npm run lint       # ESLint (Next.js config)
npm run build      # production build
```

## Project structure

```
src/
  app/(protected)/   pages behind auth: dashboard, checklist, housing, jobs, budget, documents, guide, notes, tickets, settings, users
  app/api/           server routes: AI chat, listing parser, push, crons (keepalive, daily exchange rates), admin
  components/        UI per section + shared ui/ (ModalShell, SlidePanel, FilterBar, SwipeRow, Toaster…)
  lib/               domain logic: dates/time zones, money, exchange rates, budget, runway, notifications, push, AI, Supabase clients
  proxy.ts           auth proxy (Next 16 replacement for middleware)
supabase/            migrations (full schema, RLS, triggers) + seed.sql (generic initial data)
scripts/             iOS startup image generator (sharp)
public/              icons, splash screens, service worker
```

## How it was built with Claude Code

The whole app was written with Claude Code, with me acting as product owner and reviewer.

- **`CLAUDE.md` as the project's memory.** It holds the fixed stack, the working rules and a "Progress"
  section that Claude updates at the end of every block of work, so each new session starts with
  "Read CLAUDE.md and tell me where we are" and picks up exactly where the last one stopped.
- **Small, verified steps.** One module at a time; after each one Claude updates the progress section,
  commits, and waits for approval. Every change is checked with `tsc`, ESLint and `next build` before commit.
- **Lessons become rules.** When a bug reveals a pattern (UTC dates shifting a day, `parseFloat` while
  typing, a CSS rule nested by mistake, child rows deleted on save) the fix is followed by a rule in
  `CLAUDE.md`, so the same mistake is not repeated in later sessions.
- **Tickets as the interface between user and agent.** Users file bugs from inside the app; the ticket is
  exported as a structured Markdown brief for Claude. When Claude finishes, it writes a plain-language
  resolution note in the DB and moves the ticket to "to verify", which pushes a notification to the author,
  who confirms or reopens it. Nothing is "done" without that confirmation.
- **Measure, then fix.** Performance and reliability fixes started from data: DB edge logs, auth session
  tables, latency measurements per provider and similarity scores for the RAG thresholds.
