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
                        ┌───────────────┴───────────────┐
                        ▼                               ▼
                Cloudflare D1                    Cloudflare R2
                (relational data,           (avatars / post images)
                 chat messages included)
```

- Single Worker (`apps/api`) serves the whole REST API using the Hono router.
- React SPA (`apps/web`, Vite + TS + Tailwind) is a static build served separately in
  dev (Vite dev server) and, in production, as Worker static assets / Pages.
- `packages/shared` holds TypeScript types/constants shared by both apps (API contracts,
  config enums, validation helpers) so the frontend and backend never drift.
- D1 is the single source of truth for everything, chat messages included.
- No Kubernetes/microservices/Redis/Kafka — a single Worker + D1 + R2 is sufficient for
  ~500 users, **and deliberately avoids Cloudflare Durable Objects** so the whole stack
  fits on Cloudflare's free tier (Durable Objects require the paid Workers plan). Chat
  is REST + short-interval polling instead of a live WebSocket — see §11 (Cost & hosting).

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
| Realtime chat | REST endpoints + client-side polling (~3s interval), messages persisted in D1 | Delivers the same anonymous chat experience without Durable Objects, which require the paid Workers plan — keeps the whole stack on Cloudflare's free tier at ~500 users |
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
  - `GET /api/v1/matches`, `GET/POST /api/v1/conversations/:id/messages` (client polls the
    GET endpoint with an `after` cursor for new messages — no WebSocket/Durable Object)
  - `GET /api/v1/swipes/deck`, `POST /api/v1/swipes` — a second, parallel way to match:
    the deck shows only avatar + nickname (no bio/gender/academic status pre-match); a
    mutual right-swipe auto-creates the match + conversation via the same
    `lib/matching.ts` `createMatch` helper the confession mutual-interest flow calls
    through `POST /api/v1/matches`
  - `GET/POST /api/v1/conversations/:id/reveals` — even after a match, gender,
    interests, academic status, and course stay hidden; either side opts in per field
    (`profile_reveals` table) and it only becomes visible to both once both have opted
    in for that field, mirroring the confession mutual-interest double-opt-in shape
  - `POST /api/v1/post-requests`, `POST /api/v1/post-requests/:id/image`,
    `GET /api/v1/post-requests/mine` — regular posts/comments reject links outright
    (`detectLink`); a link, poster/image, or urgent notice instead goes through this
    queue for admin approval (no payment processing)
  - `/api/v1/admin/*` (admin-only, separate authorization middleware), including
    `GET /api/v1/admin/post-requests`, `POST .../approve`, `POST .../reject`
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

### Cost & hosting: designed to run on Cloudflare's free tier

At ~500 students, this app's Cloudflare footprint is deliberately kept inside every
service's free tier:

| Service | Free tier headroom at ~500 users | Fits free tier? |
|---|---|---|
| Workers (API) | Free plan covers 100,000 requests/day | ✅ |
| D1 (database) | Free tier's storage/row-read/row-write limits are generous for a text-based feed at this scale | ✅ |
| R2 (avatars) | Free tier covers ~10GB storage; R2 also has zero egress fees beyond the free tier | ✅ |
| Durable Objects | **Not used at all** — see below | N/A |

Durable Objects are the one Cloudflare primitive that requires the paid Workers plan
(~$5/month) regardless of usage — there is no free tier for them. Since chat was the
only feature that would have needed them, chat is implemented as plain REST endpoints
(`POST /conversations/:id/messages`, `GET /conversations/:id/messages`) with the client
polling every ~3 seconds for new messages (`GET .../messages?after=<lastCreatedAt>`)
instead of holding open a live WebSocket. Messages are still persisted in D1 exactly as
before; the only user-facing difference is that a new message can take up to ~3 seconds
to appear instead of arriving instantly. This was a deliberate trade-off to keep 100%
of the stack on free-tier Cloudflare — see the chat routes in
`apps/api/src/routes/conversations.ts` for the implementation.

Not covered by Cloudflare's free tier: a real domain name (a few dollars/year, unless
using a free `*.pages.dev`-style subdomain) and a transactional email provider for OTP
delivery (most providers' free tiers — e.g. Resend — comfortably cover occasional
signup/verification volume at this scale, though a signup rush on the same day could
brush against some providers' daily send caps).

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
- **Phase 3 (Campus feed):** done. Post create/list/like/react, comments + comment
  likes, category filter, trending/latest/discussed/popular feed modes with pagination.
  Trending is computed in application code over a bounded recent window (time-decayed
  gravity formula) rather than in SQL, to avoid depending on SQLite math-function
  availability. Sensitive-info blocking and an unverified-accusation confirmation flow
  (client must explicitly "post anyway") are wired into both posts and comments. Verified
  end-to-end via `wrangler dev --local` (API) and a real headless-browser run through
  register → verify → onboard → post → like → switch feed modes.
- **Phase 4 (Moderation & safety):** done. Reports (any student can report a
  post/comment/profile/message with a reason + optional description), blocks (server
  resolves the target's real user id itself — the client only ever knows the anonymous
  profile id — and mutually excludes blocked users' posts from the feed), per-user D1-
  backed sliding-window rate limits (posts/comments/likes, configurable via env), and a
  first `/admin` API surface: stats, report queue + resolve, hide/remove/restore/hard-
  delete on posts and comments, suspend/unsuspend (suspension always a deliberate human
  action, never automatic on report count — suspending also revokes all sessions), and
  an audit log every admin action writes to. The very first admin is created via a
  one-time `/admin/bootstrap` endpoint that only works while no admin exists yet.
  Frontend: a report dialog and a per-post "more" menu (report / hide locally / block
  author). A full `/admin` UI dashboard is still Phase 9 — the API is complete and
  tested now. Verified end-to-end via `wrangler dev --local` (bootstrap, authorization
  enforcement, report → admin hide → post disappears from feed, block → author's posts
  disappear from the blocker's feed, suspend → login rejected → unsuspend → login
  succeeds, rate limit tripping at the configured threshold) and the report dialog was
  exercised in a real headless-browser session.
- **Phase 5 (Confessions):** done. Send/receive/respond (interested/sweet/not
  interested), blocked users can't confess to each other, sensitive-info and rate
  limiting apply to confessions too. Mutual interest is detected as: both users have
  independently sent a confession to the other and both got an "interested" response —
  when the second side responds interested, both get a `mutual_interest` notification
  carrying the other's anonymous profile id (never a real user id). Actually creating
  the match/conversation from that mutual state is Phase 6. Frontend: a "Send
  confession" action in the post card's menu, a notification bell with unread badge,
  and a Confessions page (received — respond inline; sent — see status). Verified
  end-to-end against `wrangler dev --local` (send → notify → respond → mutual detection
  firing correctly for both sides, double-response rejected) and the confession-send →
  notification-bell → confessions-page flow was exercised in a real headless-browser
  session across two separate logged-in users.
- **Phase 6 (Connections & anonymous chat):** done. `POST /matches` creates a match +
  conversation only when the double-opt-in mutual-interest check from Phase 5 still
  holds (re-verified server-side, never trusted from the client), and is idempotent for
  an already-active pair. Chat is plain REST + polling — `POST
  /conversations/:id/messages` to send, `GET /conversations/:id/messages` (with an
  `after` cursor) to fetch new ones, polled client-side every ~3s — re-verifying on
  every call that the session user is one of the match's two participants (the one
  IDOR check everything else depends on). Messages persist to D1 with the real
  `sender_user_id` (backend accountability), but only `isMine` (derived server-side
  from the session) is ever serialized to clients — the real user id never reaches the
  wire. This intentionally avoids Cloudflare Durable Objects (which would require the
  paid Workers plan) so the whole app stays on Cloudflare's free tier — see
  `docs/ARCHITECTURE.md` §11 ("Cost & hosting") for the trade-off. Frontend: a
  Connections list, a chat screen with polling send/receive, and a "Connect" button
  surfaced directly on the `mutual_interest` notification. Verified end-to-end:
  curl-driven match creation/listing, sending and polling-with-cursor across two
  independently-authenticated sessions (confirming cross-user delivery), a third,
  unrelated user rejected (403) from both reading and sending on the conversation, and
  the message rate limit tripping at the configured threshold.
- **Phase 7 (AI features):** done. A thin `lib/ai.ts` abstraction: when `AI_API_KEY`
  isn't configured (the default here — no real credentials are available in this
  environment), every call falls back to a deterministic template generator so the
  feature is fully testable offline; when a key is configured the same call shape
  routes to an OpenAI-compatible chat-completion endpoint instead. Every call receives
  only interests/course/shared-interests/post text — never email, password, student
  id, internal user id, or location. Four endpoints, each behind the AI rate limit:
  bio suggestions (usable during onboarding, before a profile exists — accepts
  interests/course from the form directly, falls back to the saved profile once one
  exists), post rewriting, conversation starters, and "plan something together" date
  ideas (the latter two derive shared interests from the two participants after
  re-verifying the caller belongs to that conversation — the same IDOR check as
  messaging). Nothing is ever auto-published/sent: the frontend always shows
  suggestions in a picker the student must click to insert into their own
  draft/composer, which they can still edit before submitting. Verified end-to-end via
  `wrangler dev --local` (all four endpoints returning template suggestions, an
  unrelated conversation id correctly rejected with 403, and the AI rate limit tripping
  at the configured threshold) and the rewrite-suggestion picker was exercised in a
  real headless-browser session (including seeing the rate-limit error surface
  gracefully once the quota from an earlier test run was already exhausted).
- **Phase 8 (Campus events):** done. `events` (anonymous creator, like posts —
  `anonymous_profile_id` alongside `created_by_user_id`) and `event_participants`.
  Create/list (upcoming-first by default)/detail/interested-toggle, sensitive-info
  detection on title/description/location, participant counts and the viewer's own
  interested state computed in SQL. Frontend: an Events page with inline creation and
  an "I'm interested" toggle, linked from the feed header. Verified end-to-end against
  `wrangler dev --local` (create → list → mark/unmark interested, counts and viewer
  state updating correctly) and exercised in a real headless-browser session.
- **Phase 9 (Admin & analytics):** done. Rounded out Phase 4's admin API with
  `GET /admin/me` (frontend admin-check), `GET /admin/posts` / `GET /admin/comments`
  (browsable moderation lists beyond just the report queue), and `GET /admin/events` +
  `POST /admin/events/:id/remove`. Built the `/admin` dashboard UI: Overview (live
  stats), Reports (resolve/dismiss), Posts (hide/remove/restore), Users (suspend/
  unsuspend), Audit Log — gated by an `AdminGuard` that calls `/admin/me` and redirects
  non-admins back to the feed (never a client-side role flag). Verified end-to-end in a
  real headless-browser session: an admin sees live overview stats and can resolve a
  report (which then disappears from the open-reports list), while a non-admin account
  hitting `/admin` directly is redirected to `/feed` — the same authorization the
  backend enforces.
- **Seed data:** done. `seed/seed.ts` generates ~40 fake students (varied academic
  status/gender/course/interests, correctly-hashed dev-only shared password), ~100
  posts, ~150 comments, likes/reactions, a mix of confessions including two guaranteed
  mutual pairs with an active match/conversation/messages, and a handful of campus
  events, then applies it via `wrangler d1 execute --local`. Verified end-to-end: a
  seeded student logs in with the documented dev password and sees a populated
  trending feed, confessions, matches, and events; row counts confirmed directly
  against the local D1 database.

This completes the development sequence through the MVP priority list (spec §18,
items 1–16) and the phase list (spec §17, Phases 1–9). **Phase 10 (security/production
deployment) is intentionally deferred**, per the task's explicit scope — this
repository has no remote git origin and nothing has been deployed to Cloudflare;
everything above was built and verified entirely against `wrangler dev --local` and
local D1/R2 emulation.
