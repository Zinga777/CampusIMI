import { Hono } from "hono";
import { fail, ok } from "../lib/response.js";
import { randomId } from "../lib/crypto.js";
import { createMatch } from "../lib/matching.js";
import { checkAndRecordRateLimit } from "../lib/rate-limit.js";
import { requireProfile } from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const swipeRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

swipeRoutes.use("*", requireProfile);

const DEFAULT_DECK_SIZE = 20;
const MAX_DECK_SIZE = 50;
const DIRECTIONS = ["left", "right"] as const;

interface DeckProfileRow {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  academicStatus: string;
  gender: string;
}

// The swipe deck: anonymous profiles the viewer hasn't swiped on yet, excluding
// themselves, anyone they've blocked (either direction), anyone they're already
// actively matched with, and anyone who's opted out via is_discoverable.
swipeRoutes.get("/deck", async (c) => {
  const user = c.get("user")!;
  const limit = Math.min(Number(c.req.query("limit")) || DEFAULT_DECK_SIZE, MAX_DECK_SIZE);

  const { results } = await c.env.DB.prepare(
    `SELECT ap.id, ap.display_name as displayName, ap.avatar_url as avatarUrl, ap.bio,
            ap.academic_status as academicStatus, ap.gender
     FROM anonymous_profiles ap
     JOIN users u ON u.id = ap.user_id
     WHERE ap.user_id != ?1
       AND ap.is_discoverable = 1
       AND u.account_status = 'active'
       AND NOT EXISTS (SELECT 1 FROM swipes sw WHERE sw.swiper_user_id = ?1 AND sw.swiped_profile_id = ap.id)
       AND NOT EXISTS (
         SELECT 1 FROM blocks bl
         WHERE (bl.blocker_user_id = ?1 AND bl.blocked_user_id = ap.user_id)
            OR (bl.blocked_user_id = ?1 AND bl.blocker_user_id = ap.user_id)
       )
       AND NOT EXISTS (
         SELECT 1 FROM matches m
         WHERE m.status = 'active'
           AND ((m.user_a_id = ?1 AND m.user_b_id = ap.user_id) OR (m.user_b_id = ?1 AND m.user_a_id = ap.user_id))
       )
     ORDER BY RANDOM()
     LIMIT ?2`,
  )
    .bind(user.id, limit)
    .all<DeckProfileRow>();

  return ok(c, { profiles: results });
});

swipeRoutes.post("/", async (c) => {
  const user = c.get("user")!;
  const body = (await c.req.json().catch(() => null)) as { profileId?: string; direction?: string } | null;

  if (!body?.profileId) return fail(c, "INVALID_REQUEST", "profileId is required.");
  if (!body?.direction || !DIRECTIONS.includes(body.direction as (typeof DIRECTIONS)[number])) {
    return fail(c, "INVALID_DIRECTION", "direction must be 'left' or 'right'.");
  }

  if (body.profileId === user.anonymousProfileId) {
    return fail(c, "CANNOT_SWIPE_SELF", "You can't swipe on your own profile.");
  }

  const other = await c.env.DB.prepare(`SELECT user_id as userId FROM anonymous_profiles WHERE id = ?1`)
    .bind(body.profileId)
    .first<{ userId: string }>();
  if (!other) return fail(c, "PROFILE_NOT_FOUND", "Profile not found.", 404);

  const blocked = await c.env.DB.prepare(
    `SELECT 1 FROM blocks WHERE (blocker_user_id = ?1 AND blocked_user_id = ?2) OR (blocker_user_id = ?2 AND blocked_user_id = ?1)`,
  )
    .bind(user.id, other.userId)
    .first();
  if (blocked) return fail(c, "BLOCKED", "You can't swipe on this student.", 403);

  const rateLimit = await checkAndRecordRateLimit(c.env, user.id, "like");
  if (!rateLimit.allowed) {
    return fail(c, "RATE_LIMITED", `You've reached the limit of ${rateLimit.limit} swipes per minute.`, 429);
  }

  await c.env.DB.prepare(
    `INSERT INTO swipes (id, swiper_user_id, swiped_profile_id, direction) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(swiper_user_id, swiped_profile_id) DO UPDATE SET direction = excluded.direction`,
  )
    .bind(randomId(), user.id, body.profileId, body.direction)
    .run();

  if (body.direction !== "right") {
    return ok(c, { matched: false });
  }

  // Mutual right-swipe: has the other person already swiped right on *my* profile?
  const theirSwipeOnMe = await c.env.DB.prepare(
    `SELECT 1 FROM swipes WHERE swiper_user_id = ?1 AND swiped_profile_id = ?2 AND direction = 'right'`,
  )
    .bind(other.userId, user.anonymousProfileId)
    .first();

  if (!theirSwipeOnMe) return ok(c, { matched: false });

  const result = await createMatch(c.env, user.id, other.userId);
  if (result.ended) return ok(c, { matched: false });

  return ok(c, { matched: true, matchId: result.matchId, conversationId: result.conversationId });
});
