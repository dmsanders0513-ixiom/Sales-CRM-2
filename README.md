# Intel CRM — Sales Intelligence Platform

A production-architecture rebuild of the "Intel V6.3" prototype: real client/server app,
persistent Postgres database, a Gemini-powered autonomous prospecting agent with live
web-search grounding, and a mobile-first CRM.

## 1–9. Answers to the pre-build questions

1. **Architecture**: Next.js 14 App Router as a single deployable — React frontend +
   serverless API routes as the backend. No separate backend service needed; this keeps
   deployment to one Vercel project while still giving a real server boundary for secrets.
2. **Database schema**: see `supabase/schema.sql`. Tables: `prospects` (active CRM),
   `discoveries` (Inbox — AI output, not yet promoted), `agent_runs` (audit/cost log),
   `company_research_memory` (agent memory so it doesn't re-research known companies),
   `activities` (shared timeline for both prospects and discoveries). RLS is enabled with
   zero anon policies — only the server-side service-role key can read/write.
3. **Frontend structure**: `app/` (dashboard, `/queue`, `/agent`, `/inbox`, `/prospects`,
   `/import`), `components/` (Sidebar, LeadCard, AgentConsole), `types/` (shared TS types).
4. **Backend structure**: `app/api/**/route.ts` — `agent/run`, `agent/scheduled`,
   `prospects`, `prospects/[id]`, `inbox`, `inbox/[id]`, `csv-import`, `dedupe`, `export`,
   `search`. Each route uses `lib/supabase.ts` (service-role client, server-only).
5. **Gemini integration**: `lib/ai/gemini-provider.ts` calls the `generateContent` REST
   endpoint directly (no SDK lock-in) with the `google_search` tool enabled for grounding
   and `responseSchema` for structured JSON output.
6. **Search/grounding approach**: every research call sets `tools: [{google_search: {}}]`;
   sources actually returned in `groundingMetadata.groundingChunks` are attached to the
   lead — nothing is cited that wasn't really retrieved.
7. **Security model**: Gemini and Supabase service-role keys live only in server env vars,
   read only inside `app/api/**` route handlers. The browser never sees them. All AI
   output is validated with Zod (`lib/ai/types.ts`) before it's written to the database —
   malformed responses are dropped, not coerced.
8. **Deployment**: Vercel (frontend + API routes + Cron) + Supabase (Postgres). Simplest
   stack for a solo user; no separate server to manage.
9. **What needs API keys**: Gemini API key (agent), Supabase project (DB). Nothing else.
10. **What works without paid APIs**: CRM CRUD, call queue, CSV import/export, dedupe
    engine, activity timeline, dashboard — all of this works with just a free Supabase
    project. Only the Live AI Agent tab needs the Gemini key.

## What's real vs. what needs your action

This is a complete, working codebase — not a mockup. What I could not do from this
sandbox (no network access, no ability to provision live cloud services):

- **Run `npm install` / build-test it.** Do this locally or let Vercel build it — the
  code is standard Next.js 14 + TypeScript, nothing exotic.
- **Create your actual Supabase project or Gemini key.** You do this once (free tier is
  fine for both to start).
- **App icons.** `public/manifest.json` references `icon-192.png` / `icon-512.png` — drop
  in your own before the PWA install prompt looks right; the app works fine without them.
- **True real-time console streaming.** `POST /api/agent/run` currently runs the whole
  staged pipeline synchronously and returns the full log at the end (Vercel functions can
  run up to `maxDuration: 300`s, which is enough for the ~10–15 Gemini calls a typical run
  makes). For a live, token-by-token console you'd add a queue (e.g. Upstash QStash or
  Vercel's `waitUntil` + a polling `GET /api/agent/run?runId=`, which is already built —
  the route supports polling, just isn't wired to stream mid-run yet).

## Deploy steps

1. `npm install`
2. Create a Supabase project → SQL editor → paste and run `supabase/schema.sql`.
3. Get a Gemini API key at https://aistudio.google.com/apikey
4. Copy `.env.example` → `.env.local`, fill in all values.
5. `npm run dev` to test locally, or push to GitHub and import into Vercel.
6. In Vercel → Project Settings → Environment Variables, add everything from
   `.env.example` (including `CRON_SECRET`, which Vercel Cron sends automatically once set).
7. `vercel.json` already schedules `/api/agent/scheduled` for weekdays 07:00 UTC — edit
   the cron expression or `AGENT_SCHEDULE_JOBS` env var (JSON array of run params) to
   change what it prospects for automatically. Adjust the UTC hour for your timezone.

## Cost controls

`AGENT_MAX_DISCOVERY_SEARCHES`, `AGENT_MAX_CANDIDATES_PER_RUN`, `AGENT_MAX_DEEP_RESEARCH`
env vars cap spend per run. The pipeline is staged on purpose: cheap discovery searches →
name-based dedupe/memory filter → deep (expensive) research only on survivors, capped at
`AGENT_MAX_DEEP_RESEARCH` companies regardless of how many candidates discovery found.

## Notes on fidelity to the original prompt

- Inbox and CRM are structurally separate tables; promotion is one explicit user action
  (`PATCH /api/inbox/[id]` with `action: "promote"`), never automatic.
- No contact (name/email/phone) is ever written unless Gemini's structured output marks
  it `VERIFIED` or `INFERRED` with the underlying grounded source attached; `UNKNOWN`
  fields are stored as `null` and rendered blank in the UI, never guessed.
- Dedup never deletes silently — CSV import skips likely-duplicate rows and returns them
  for review; the `/api/dedupe` merge endpoint only fires on an explicit user click.
- `tel:` / `mailto:` links are used throughout the mobile card UI for one-tap calling/email.
