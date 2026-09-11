# CampusIMI

A private, anonymous social network for a single college (~500 students), gated by
college email verification. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the
full architecture, schema, and design rationale.

> **Status:** local development only. No remote git origin is configured and nothing is
> deployed to Cloudflare — see "Local development only" below.

## Stack

React + TypeScript + Tailwind (frontend) · Cloudflare Workers + Hono (API) · Cloudflare D1
(database) · Cloudflare R2 (media) · Durable Objects (chat, from Phase 6 onward).

## Project layout

```
apps/web       React (Vite) frontend
apps/api       Cloudflare Worker API (Hono)
packages/shared  Shared TypeScript types & config, used by both apps
migrations/     D1 SQL migrations
seed/           Dev-only fake seed data
docs/           Architecture notes
```

## Local development only

Per project requirements, this repository is developed **entirely locally** for now:
no remote git origin, no `wrangler deploy`, no production Cloudflare resources. All
commands below use `wrangler dev --local` / D1's local emulated mode and never touch a
real Cloudflare account.

## Getting started

```bash
npm install
cp .env.example .env
cp apps/api/.dev.vars.example apps/api/.dev.vars   # local secrets, gitignored

# apply D1 migrations to the local emulated database
npm run db:migrate:local

# (optional) load dev-only fake data
npm run seed:local

# run the API (Worker, local D1/R2 emulation) and the web frontend together
npm run dev
```

- API: http://127.0.0.1:8787 (proxied by the frontend dev server under `/api`)
- Web: http://127.0.0.1:5173

Edit `COLLEGE_NAME` / `COLLEGE_EMAIL_DOMAINS` in `apps/api/wrangler.toml` (or `.env`) to
match your college — registration checks the domain of every signup email against this
list before creating an account.

Since no real email provider is wired up yet, `POST /api/v1/auth/register` logs the OTP
to the Worker console and also returns it in the response body under `devOtp` (dev-mode
only) so you can complete verification locally without a mailbox.

## Checks

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Development phases

Built incrementally and sequentially, per `docs/ARCHITECTURE.md`:

1. **Foundation** — monorepo, D1 schema, college-domain-gated auth, landing page. ✅
2. Anonymous identity (mandatory academic status + gender, bio, avatar)
3. Campus feed (posts, likes, comments, trending)
4. Moderation & safety (reports, blocks, rate limits, admin dashboard, audit log)
5. Confessions
6. Connections & anonymous chat (Durable Objects)
7. AI features (advisory only, user-approved before publish/send)
8. Campus events
9. Admin & analytics
10. Security & production deployment — **intentionally deferred**, see task scope.

## Security notes

- `email` is never returned from any public-facing endpoint except the owner's own
  `/auth/me` context, and is enforced `UNIQUE` at the database level.
- Sessions are opaque tokens; only their SHA-256 hash is stored server-side.
- Every protected endpoint resolves the acting user from the session — never from a
  client-supplied id — to prevent IDOR.
- API errors never leak stack traces or internal details; every response follows the
  `{ success, data }` / `{ success: false, error }` envelope.
