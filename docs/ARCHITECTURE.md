# CampusIMI — Architecture & Design Document

Private, anonymous, single-college social network (~500 students). This document is the
answer to the "first task" analysis requested in the spec, and is kept up to date as the
implementation proceeds phase by phase.

## 1. Final Architecture

```
                         ┌─────────────────────────────┐
   Browser (React SPA)   │        Cloudflare Edge       │
   apps/web  ───────────▶│  Worker (apps/api, Hono)     │
                         │   - REST JSON API             │
                         │   - Session auth (cookie)     │
                         │   - Rate limiting              │
                         └──────────────┬────────────────┘
                                        │
                ┌───────────────────────┼───────────────────────┐
                ▼                       ▼                       ▼
        Cloudflare D1            Cloudflare R2           Durable Objects
        (relational data)     (avatars / post images)     (chat rooms, WS)
```

- Single Worker (`apps/api`) serves the whole REST API using the Hono router.
- React SPA (`apps/web`, Vite + TS + Tailwind) is a static build served separately in
  dev (Vite dev server) and, in production, as Worker static assets / Pages.
- `packages/shared` holds TypeScript types/constants shared by both apps (API contracts,
  config enums, validation helpers) so the frontend and backend never drift.
- D1 is the single source of truth. Durable Objects are used only for realtime chat
  fan-out (Phase 6); all chat messages are still persisted to D1.
- No Kubernetes/microservices/Redis/Kafka — a single Worker + D1 + R2 + DO is sufficient
  for ~500 users.

## 2. Technology Choices

| Concern | Choice | Why |
|---|---|---|
| API framework | [Hono](https://hono.dev) on Cloudflare Workers | Tiny, typed, first-class Workers support, middleware for auth/rate-limit/CORS |
| DB | Cloudflare D1 (SQLite) | Required by spec, fine for ~500 users, local emulation via `wrangler d1` |
| ORM | Raw parameterized SQL via `D1Database.prepare()` (thin query helpers) | Avoids heavy ORM complexity for a student-scale app; keeps SQL auditable for security review |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS | Fast local dev, Cloudflare-compatible, small bundle |
| Icons | lucide-react | Matches spec |
| Auth | Session cookies (HttpOnly, Secure, SameSite=Lax) backed by a `sessions` table | Simple, revocable, no JWT statelessness needed at this scale |
| Password hashing | PBKDF2-SHA256 via Web Crypto (`crypto.subtle`), available natively in Workers | No native bcrypt in Workers runtime; PBKDF2 with high iteration count is an accepted standard |
| Realtime chat | Durable Objects + WebSocket | Required by spec |
| File storage | Cloudflare R2 | Required by spec |
| AI | Pluggable `AI_API_KEY` provider behind a thin server-side abstraction | Never called with PII; advisory only |
| Monorepo tooling | npm workspaces | Simplest option, no Turborepo needed per spec |

## 3. D1 Database Schema

See `migrations/*.sql` for the authoritative, versioned schema. Summary of tables
(built incrementally per phase — Phase 1 introduces `users` and `sessions`):

- `users` — id, email (unique, never exposed), password_hash, is_verified, account_status,
  created_at, updated_at, last_active_at
- `email_otps` — id, user_id, otp_hash, purpose, expires_at, consumed_at, created_at
- `anonymous_profiles` — id, user_id (unique), display_name (unique), avatar_url, bio,
  academic_status, gender, course, interests (JSON text), is_discoverable, created_at, updated_at
- `sessions` — id (opaque token hash), user_id, created_at, expires_at, user_agent, ip_hash
- `posts` — id, author_user_id, anonymous_profile_id, content, category, status,
  like_count, comment_count, reaction_count, created_at, updated_at
- `post_likes` — id, post_id, user_id, created_at (unique(post_id,user_id))
- `post_reactions` — id, post_id, user_id, reaction_type, created_at (unique(post_id,user_id))
- `comments` — id, post_id, author_user_id, anonymous_profile_id, parent_comment_id, content, status, like_count, created_at, updated_at
- `comment_likes` — id, comment_id, user_id, created_at (unique(comment_id,user_id))
- `confessions` — id, sender_user_id, recipient_profile_id, message, status, created_at
- `confession_responses` — id, confession_id, responder_user_id, response, created_at
- `matches` — id, user_a_id, user_b_id, status, created_at, updated_at
- `conversations` — id, match_id, created_at
- `messages` — id, conversation_id, sender_user_id, message, created_at, read_at, deleted_at
- `blocks` — id, blocker_user_id, blocked_user_id, created_at
- `reports` — id, reporter_user_id, content_type, content_id, reason, description, status, created_at, resolved_at, resolved_by
- `notifications` — id, user_id, type, payload (JSON), is_read, created_at
- `events` — id, created_by_user_id, title, description, location, starts_at, created_at
- `event_participants` — id, event_id, user_id, created_at
- `admin_users` — id, user_id, role, created_at
- `audit_logs` — id, admin_user_id, action, target_type, target_id, metadata (JSON), created_at

Indexes are added alongside each table's migration per §11 of the spec (posts:
created_at/category/status/author_user_id; likes: post_id/user_id; comments:
post_id/created_at; notifications: user_id/is_read; messages: conversation_id/created_at;
reports: status/created_at).

## 4. Entity Relationships (high level)

```
users 1───1 anonymous_profiles
users 1───N sessions
users 1───N posts (author_user_id)      anonymous_profiles 1───N posts (anonymous_profile_id)
posts 1───N comments, post_likes, post_reactions
comments 1───N comment_likes, comments (self, parent_comment_id)
users 1───N confessions (sender)         anonymous_profiles 1───N confessions (recipient)
confessions 1───N confession_responses
users N───N users via matches (user_a_id/user_b_id)
matches 1───1 conversations 1───N messages
users 1───N blocks (blocker), users 1───N blocks (blocked)
users 1───N reports (reporter)
users 1───N notifications
users 1───N events (creator), events N───N users via event_participants
users 1───1 admin_users (optional)
admin_users 1───N audit_logs
```

The critical accountability edge is `anonymous_profiles.user_id → users.id`: every
anonymous-facing table stores `anonymous_profile_id` for display, but always also stores
the real `*_user_id` for server-side enforcement (blocks, rate limits, moderation, IDOR
checks). `*_user_id` columns are **never** serialized in any public API response.

## 5. API Architecture

- Base path `/api/v1`.
- Consistent envelope: `{ "success": true, "data": ... }` or
  `{ "success": false, "error": { "code": "...", "message": "..." } }`.
- Auth middleware resolves the session cookie → `users.id` and attaches `ctx.user` server
  side; handlers never trust a client-supplied user/profile id.
- Route groups (added incrementally per phase):
  - `POST /api/v1/auth/register`, `POST /api/v1/auth/verify-otp`, `POST /api/v1/auth/login`,
    `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`
  - `GET/PUT /api/v1/profile`
  - `GET/POST /api/v1/posts`, `POST /api/v1/posts/:id/like`, `POST /api/v1/posts/:id/react`
  - `GET/POST /api/v1/posts/:id/comments`, `POST /api/v1/comments/:id/like`
  - `POST /api/v1/reports`, `POST /api/v1/blocks`
  - `POST /api/v1/confessions`, `POST /api/v1/confessions/:id/respond`
  - `GET /api/v1/matches`, `GET /api/v1/conversations/:id/messages` (+ DO WebSocket upgrade)
  - `/api/v1/admin/*` (admin-only, separate authorization middleware)
- Config-driven values (categories, academic-status labels, gender options, rate limits)
  live in `packages/shared/src/config.ts`, overridable via environment/config, never
  hard-coded in route handlers.

## 6. Project Folder Structure

```
CampusIMI/
├── apps/
│   ├── web/                # React + Vite + Tailwind SPA
│   │   └── src/
│   └── api/                 # Cloudflare Worker (Hono)
│       └── src/
│           ├── routes/
│           ├── middleware/
│           ├── lib/
│           └── index.ts
├── packages/
│   └── shared/               # Shared TS types & config, used by both apps
│       └── src/
├── migrations/                # D1 SQL migrations, one file per phase/feature
├── seed/                       # Dev-only fake data scripts
├── docs/                        # Architecture & phase notes
└── .env.example
```

## 7. Authentication Strategy (multi-domain college gating)

1. `COLLEGE_EMAIL_DOMAINS` env var holds a comma-separated list (e.g.
   `cse.college.edu,ece.college.edu,college.edu`). Parsed once into a `Set<string>` in
   `packages/shared`.
2. `POST /auth/register` validates the email's domain against that set **before** any DB
   write — domain mismatch returns `400 INVALID_DOMAIN` immediately.
3. On success, a `users` row is created with `account_status = 'pending_verification'`, a
   6-digit OTP is generated, hashed (SHA-256) and stored in `email_otps` with a short TTL,
   and the (dev-mode) "send" step logs/returns the OTP for local testing since no real
   mail provider is configured yet — production wiring is a `sendEmail()` seam to swap in
   later without touching route logic.
4. `POST /auth/verify-otp` checks the hash + expiry, marks the user `active`, consumes the
   OTP, and issues a session.
5. `email` has a `UNIQUE` DB constraint (enforced by SQLite) — duplicate registration
   attempts fail at the DB layer even if application logic had a bug.
6. Manual admin verification fallback: an `account_status = 'pending_manual_review'`
   path plus an admin-only endpoint to approve, for students without an issued college
   email yet — never auto-approved.
7. `email` is never selected into any response DTO that isn't the user's own `/auth/me`.
8. Sessions: opaque random 256-bit token, only its SHA-256 hash stored server-side,
   set as an HttpOnly/Secure/SameSite=Lax cookie; server resolves cookie → session →
   user on every request.

## 8. Anonymous Identity Strategy

- One `anonymous_profiles` row per `user_id` (unique), created immediately after
  verification, before the student can see the feed (onboarding gate enforced both
  client-side routing and server-side: protected endpoints 403 until a profile exists).
- `academic_status` and `gender` are `NOT NULL` columns with `CHECK` constraints against
  the configured enum — the API rejects incomplete onboarding payloads before insert.
- `display_name` is generated server-side from a curated adjective+noun word list
  (e.g. "MidnightOwl"), checked for uniqueness and against a reserved-name blocklist
  (`admin`, `moderator`, `collegeofficial`, `principal`, ...) case-insensitively, with
  collision retry.
- Every table that displays user content stores both `anonymous_profile_id` (public) and
  `*_user_id` (private, for accountability) — only the former is ever serialized to
  clients other than the author themselves.
- No endpoint resolves `anonymous_profile_id → user_id` for normal clients; only
  admin-authorization-gated moderation code paths may do that join, and every such access
  is written to `audit_logs`.

## 9. Trending Algorithm Design

```
recency_hours = (now - post.created_at) / 3600
raw_score     = likes*2 + comments*4 + reactions*1
decay         = 1 / (1 + recency_hours/12)^1.5     -- gravity-style decay, ~half-life ~12-18h
trending_score = raw_score * decay
```

- Recomputed on read (SQL expression at query time over a bounded recent window, e.g.
  last 14 days) rather than stored, to avoid stale scores without a cron; the "Trending"
  feed query orders by this expression with `created_at` as a tiebreaker.
- A short per-post rolling window (e.g. "recent_engagement_weight" = likes/comments in the
  last 2h weighted higher) is added by only counting reactions from the last N hours more
  heavily — implemented by joining `post_likes`/`comments` filtered by recent `created_at`
  in addition to the cached counters, so a decade-old high-like post cannot dominate.
- Vote manipulation resistance: `UNIQUE(post_id, user_id)` on likes/reactions (one per
  user), rate limits on likes/comments per minute, and same-user self-like prevention.

## 10. Moderation Strategy

- **Layer 1 (advisory, synchronous, at submission time):** a server-side filter
  (`apps/api/src/lib/moderation.ts`) checks content against: banned-word list, regex
  patterns for phone numbers/emails/addresses/student IDs, and a lightweight
  unverified-accusation heuristic. Matches on hard PII patterns **block** submission with
  a clear message; softer matches (potential targeted harassment/gossip about an
  identifiable person) return a warning the client shows before allowing the user to
  confirm-resubmit. An optional AI classifier tags `safe/needs_review/high_risk` as a
  second advisory signal (Phase 7+); `high_risk` auto-hides pending human review but is
  never itself a ban/delete authority.
- **Layer 2 (human, authoritative):** `/admin` reports queue, populated by user reports
  and auto-flagged (`needs_review`/`high_risk`) content. All destructive/administrative
  actions (hide/remove/restore/suspend/unsuspend/delete/resolve) go through
  admin-authorization middleware and are written to `audit_logs` (actor, action, target,
  timestamp, metadata). Suspensions are always a deliberate manual action — no
  auto-suspend on report-count thresholds.
- Admin de-anonymization (`anonymous_profile_id → user_id` join) is isolated to a single
  audited helper function so every use is traceable; viewing private conversation content
  for moderation is logged as a distinct sensitive `audit_logs` action type.

## 11. Cloudflare Deployment Strategy (deferred — local-only for now)

Per the task instructions, **Phase 10 (production deployment) is intentionally deferred**.
For now:
- `wrangler dev --local --persist-to=.wrangler/state` runs the Worker + emulated D1 + R2
  entirely locally, no real Cloudflare account/credentials needed.
- `wrangler.toml` defines local D1/R2 bindings only; no `account_id`/production routes are
  configured yet.
- `pnpm`/`npm` workspace script `dev` runs the Worker and the Vite dev server together.
- When deployment is later requested: `wrangler d1 migrations apply --remote`, `wrangler
  deploy`, and Pages/Workers static asset hosting for `apps/web`'s build output — not done
  in this task.

## 12. Potential Security/Privacy Risks (tracked, mitigated per phase)

1. **De-anonymization via timing/correlation** — mitigated by not exposing per-post
   timestamps at sub-minute precision in aggregate, and never leaking `user_id` anywhere;
   residual risk accepted as inherent to any pseudonymous system at this scale.
2. **IDOR on messages/posts/reports** — mitigated by always deriving the actor from the
   session, never from a client-supplied id, and verifying ownership/membership
   server-side on every read/write (explicit unit tests planned in Phase 6).
3. **Session fixation/theft** — HttpOnly/Secure cookies, session rotation on login,
   opaque tokens hashed at rest.
4. **PII leakage via AI calls** — the AI abstraction only ever receives a minimal,
   explicitly allow-listed context object (interests/bio/conversation text), never
   email/password/student id/user id/precise location.
5. **Enumeration of college emails** — registration/verification error messages are
   generic ("if this email is eligible, we've sent a code") to avoid confirming which
   emails exist.
6. **Rate-limit bypass / spam** — per-user (not just per-IP) counters stored server-side,
   since IPs are shared on campus wifi.
7. **R2 upload abuse** — content-type/size validation, private profile images optionally
   re-encoded, no arbitrary file passthrough.
8. **Admin over-reach** — every admin de-anonymization/action logged immutably in
   `audit_logs`, separate "viewed private messages" log entries, admin role stored
   server-side only.

---

## Phase Log

- **Phase 1 (Foundation):** done. Monorepo, D1 users/sessions/OTP schema, college-domain
  gated register/verify/login/logout/me, landing page.
- **Phase 2 (Anonymous identity):** done. `anonymous_profiles` create/read/update,
  server-generated unique display names with a reserved-name blocklist, mandatory
  `academic_status`/`gender`, optional bio/course/interests, sensitive-info detection on
  bios, optional custom avatar upload to R2 with public serving, onboarding UI gating
  feed access until a profile exists.
