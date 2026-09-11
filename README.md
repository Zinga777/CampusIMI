# CampusIMI

A private, anonymous social network for a single college (~500 students), gated by
college email verification. Think Reddit + anonymous confessions + a lightweight,
secondary dating/matching feature — not a dating app first.

Students post anonymously (confessions, gossip, campus chatter, rants), react and
comment, and can optionally send anonymous confessions to each other; when two people
have independently confessed interest in each other, they unlock an anonymous real-time
chat. Every anonymous action is tied internally to the real account for moderation
purposes, but that link is **never** exposed to other students or in any public API
response — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design
rationale, database schema, and the security/anonymity threat model.

> **Status:** fully functional for local development. Every feature phase below is
> built and tested against `wrangler dev --local` + Vite. Production deployment to
> Cloudflare has **not** been done — see "What's pending" below. The whole stack is
> designed to run entirely on Cloudflare's **free tier** at ~500 users (chat uses REST
> + polling instead of Durable Objects specifically to avoid the paid plan — see
> `docs/ARCHITECTURE.md` §11).

## What's done vs. pending

| Feature | Status |
|---|---|
| Auth (college-domain-gated signup, OTP email verification) | ✅ Done |
| Anonymous identity (mandatory academic status + gender, bio, avatar upload) | ✅ Done |
| Campus feed (posts, likes, reactions, comments, trending/latest/discussed/popular) | ✅ Done |
| Moderation & safety (reports, blocks, rate limits, admin API, audit log) | ✅ Done |
| Confessions + mutual-interest detection + notifications | ✅ Done |
| Matching & anonymous chat (REST + polling, free-tier friendly) | ✅ Done |
| AI features (bio/post/conversation-starter suggestions) | ✅ Done — falls back to template suggestions with no `AI_API_KEY` configured; the same code path calls a real LLM once one is provided |
| Campus events (create, RSVP/"interested") | ✅ Done |
| Admin dashboard (stats, reports, posts, users, audit log) | ✅ Done |
| Admin-gated promoted content (links/images blocked in regular posts+comments; students request admin approval to share a link, poster, or urgent notice) | ✅ Done — no payment processing in this version |
| Automated tests (43 tests: password hashing, trending algorithm, moderation regexes incl. link detection, college-domain gating, display-name generation) | ✅ Done |
| Admin-approval flow for `pending_manual_review` accounts | ⬜ Pending — DB status exists, no endpoint/UI to approve |
| Password reset | ⬜ Pending — OTP mechanism supports it structurally, no reset endpoint/UI |
| Admin moderation view for reported private chat messages | ⬜ Pending — messages are reportable, nothing to act on the report yet |
| Login brute-force rate limiting | ⬜ Pending — not in original spec, worth adding before real users |
| Cloudflare production deployment | ⬜ Not started (out of scope so far — this repo has only run against local emulation) |

## Tech stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS, `react-router-dom`, `lucide-react` icons.
- **Backend:** Cloudflare Workers + [Hono](https://hono.dev) (routing/middleware).
- **Database:** Cloudflare D1 (SQLite), plain parameterized SQL (no ORM).
- **File storage:** Cloudflare R2 (avatar uploads, magic-byte validated).
- **Chat:** REST + client-side polling (~3s), no Durable Objects — keeps the whole app on Cloudflare's free tier.
- **Auth:** Session cookies (HttpOnly, SameSite=Lax, `Secure` only over HTTPS), PBKDF2 password hashing via Web Crypto.
- **Testing:** Vitest.
- **Monorepo:** npm workspaces (no Turborepo/Nx — kept deliberately simple).

## Project layout

```
apps/
  web/                React (Vite) frontend
    src/
      pages/          Route-level screens (Feed, Chat, Admin, Events, ...)
      components/     Reusable UI pieces
      lib/             API client, auth/config React contexts
  api/                Cloudflare Worker API (Hono)
    src/
      routes/         One file per resource (posts, auth, admin, matches, ...)
      middleware/      Session auth + admin-authorization guards
      lib/             Crypto, rate limiting, moderation filters, trending algorithm
      *.test.ts        Vitest unit tests, colocated with the code they test
    wrangler.toml       Worker config: D1/R2 bindings, non-secret vars (no Durable Objects — free-tier friendly)
    .dev.vars.example   Template for local secrets (copy to .dev.vars, gitignored)
packages/
  shared/             TypeScript types & config shared by both apps (enums, API shapes)
migrations/           D1 SQL migrations, applied in order (0001... 0008...)
seed/                 Dev-only fake data generator (never real student data)
docs/
  ARCHITECTURE.md      Full architecture, schema, entity relationships, security notes
.env.example           Reference doc for every config value the Worker uses (see note below)
```

## Getting started (fresh unzip, any machine)

Requires Node.js 18+ and npm. No Cloudflare account, no login, and no external
credentials are needed for local development — everything runs against Cloudflare's
local emulation.

```bash
npm install

# Worker secrets (SESSION_SECRET, AI_API_KEY) — gitignored, never committed
cp apps/api/.dev.vars.example apps/api/.dev.vars

# apply D1 migrations to a fresh local database
npm run db:migrate:local

# (optional) load dev-only fake data — see "Seed data & test credentials" below
npm run seed:local

# run both the API (Worker) and the web frontend together
npm run dev
```

Then open **http://localhost:5173** in your browser.

- Frontend: http://localhost:5173
- API: http://localhost:8787 (the frontend proxies `/api/*` to this automatically;
  you don't need to open it directly)

To stop: `Ctrl+C` once (it stops both processes).

### A note on configuration files

Non-secret config (college name/domains, rate limits, CORS allowlist) lives in
`apps/api/wrangler.toml`'s `[vars]` block, already filled in with working local
defaults — edit values there directly. The two real secrets (`SESSION_SECRET`,
`AI_API_KEY`) come from `apps/api/.dev.vars`, which you create from
`.dev.vars.example` above. The root `.env.example` is a **reference document**
listing every variable and what it does — nothing in this repo automatically reads a
root `.env` file (no `dotenv`, no `process.env` reads), so copying it to `.env` alone
won't change any behavior; it exists so you have one place to see everything that's
configurable and why.

### Seed data & test credentials

`npm run seed:local` generates ~40 fake students (varied academic status, gender,
course, interests), ~100 posts, ~150 comments, likes/reactions, a mix of confessions
(including two guaranteed mutual-interest pairs with an active match + conversation +
messages already seeded), and a handful of campus events. It's clearly **dev-only fake
data — never real student information** — and prints exactly which accounts it created.

- **Password for every seeded account:** `password123`
- **Exact emails:** printed to the console when you run the seed script (each
  student's college-email domain is picked randomly from `COLLEGE_EMAIL_DOMAINS`, so
  there's no fixed list — e.g. it might print `student1@college.edu` or
  `student7@cse.college.edu`). Look for the line `Example login: ...` at the end of
  the script's output, or query them yourself:
  ```bash
  cd apps/api
  npx wrangler d1 execute campusimi-db --local --command "SELECT email FROM users LIMIT 10"
  ```
- Not idempotent: re-running the seed script against a database that already has it
  loaded will error on duplicate emails (harmlessly) — run it once per fresh database.

**To test as an admin:** no seeded account is an admin by default. Register any
account through the UI (or reuse a seeded one), verify it, then promote it via the
one-time bootstrap endpoint (works only while no admin exists yet):

```bash
# after logging in through the browser, grab the session cookie from devtools, or:
curl -c cookies.txt -X POST http://localhost:8787/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"YOUR_SEEDED_OR_REGISTERED_EMAIL","password":"password123"}'

curl -b cookies.txt -X POST http://localhost:8787/api/v1/admin/bootstrap
```

Then visit `/admin` in the browser while logged in as that account.

**No real email provider is configured** — `POST /api/v1/auth/register` (and
resend-otp) logs the verification code to the Worker's terminal output and also
returns it in the response body as `devOtp` (dev-mode only), so you can complete
signup end-to-end without a mailbox. The registration/verification UI shows this code
directly for convenience.

## Checks

```bash
npm run typecheck   # TypeScript across all packages
npm run lint        # ESLint (apps/api, apps/web)
npm run test        # Vitest — 43 tests covering crypto, moderation, trending, etc.
npm run build       # Production build of all packages (also validates the Worker bundle)
```

All four currently pass clean. Run them after any change before considering it done.

## Security notes for whoever continues this

- `email` is never returned from any endpoint except the owner's own `/auth/me`, and
  is `UNIQUE` at the database level.
- Sessions are opaque random tokens; only their SHA-256 hash is stored server-side.
  The `Secure` cookie attribute is conditional on the request being served over HTTPS
  (required for it to work locally over plain HTTP — don't hardcode it back to `true`).
- CORS validates the request `Origin` against the `ALLOWED_ORIGINS` allowlist in
  `wrangler.toml` — never change this back to reflecting an arbitrary origin while
  `credentials: true` is set; that combination lets any website make
  cookie-authenticated requests to the API on a logged-in user's behalf.
- Every protected endpoint resolves the acting user from the session — never from a
  client-supplied id — to prevent IDOR. This is especially load-bearing in
  `apps/api/src/routes/conversations.ts` (`assertParticipant`), which both the message
  send and poll endpoints re-check on every single call.
- The real `user_id` is never serialized to a normal client anywhere — only an
  `anonymous_profile_id` is. Admin-only endpoints are the sole exception (by design,
  for moderation), and every admin action is written to `audit_logs`.
- API errors never leak stack traces or internal details; every response follows the
  `{ success, data }` / `{ success: false, error: { code, message } }` envelope.
- Avatar uploads verify the file's actual magic bytes match the claimed image type
  (don't trust `Content-Type` alone), and are served with `X-Content-Type-Options:
  nosniff`.
- Matched/chat messages run the same `detectSensitiveInfo` check as posts (warn +
  "send anyway", not a hard block, since two matched people may legitimately choose to
  exchange real contact info) — otherwise nothing stopped someone from typing a phone
  number or handle straight into an otherwise-anonymous conversation.
- Regular posts/comments reject any link/URL at submission time
  (`lib/moderation.ts` `detectLink`) — links, posters, and images can only reach the
  feed via `post_requests`, which requires admin approval (`routes/admin.ts`
  `/post-requests/:id/approve`) and is fully audit-logged. Uploaded request images go
  through the same magic-byte validation as avatars.
- See `docs/ARCHITECTURE.md` for the full list of design decisions and the residual
  risks called out there (e.g. `rate_limit_events` grows unbounded — fine for local
  dev/small scale, needs a cleanup job before real production traffic).

## Deploying (not done yet)

This repo has only ever run against Cloudflare's local emulation
(`wrangler dev --local`, local D1/R2 emulation) — no `wrangler deploy` has been
run, and `wrangler.toml` has no `account_id` or production routes configured. To take
this to production you'd need to: create the real D1 database and R2 bucket in a
Cloudflare account, update `wrangler.toml` with the real `database_id`/`account_id`,
set real secrets via `wrangler secret put`, tighten `ALLOWED_ORIGINS` to the real
frontend origin, and decide how `apps/web`'s build output gets served (Cloudflare
Pages, or as Worker static assets).
