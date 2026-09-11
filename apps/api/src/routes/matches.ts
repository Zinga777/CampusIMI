import { Hono } from "hono";
import { fail, ok } from "../lib/response.js";
import { randomId } from "../lib/crypto.js";
import { createNotification } from "../lib/notifications.js";
import { requireProfile } from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const matchRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

matchRoutes.use("*", requireProfile);

/** Same double-opt-in check used by the confessions mutual-interest notification —
 * kept here too since a match can only be created when it still holds true. */
async function hasMutualInterest(env: Env, userAId: string, userAProfileId: string, userBId: string, userBProfileId: string): Promise<boolean> {
  const aToB = await env.DB.prepare(
    `SELECT 1 FROM confessions cf JOIN confession_responses cr ON cr.confession_id = cf.id
     WHERE cf.sender_user_id = ?1 AND cf.recipient_profile_id = ?2 AND cr.response = 'interested' LIMIT 1`,
  )
    .bind(userAId, userBProfileId)
    .first();
  const bToA = await env.DB.prepare(
    `SELECT 1 FROM confessions cf JOIN confession_responses cr ON cr.confession_id = cf.id
     WHERE cf.sender_user_id = ?1 AND cf.recipient_profile_id = ?2 AND cr.response = 'interested' LIMIT 1`,
  )
    .bind(userBId, userAProfileId)
    .first();
  return Boolean(aToB) && Boolean(bToA);
}

function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

matchRoutes.get("/", async (c) => {
  const user = c.get("user")!;
  const { results } = await c.env.DB.prepare(
    `SELECT m.id, m.status, m.created_at as createdAt, co.id as conversationId,
            CASE WHEN m.user_a_id = ?1 THEN m.user_b_id ELSE m.user_a_id END as otherUserId
     FROM matches m
     JOIN conversations co ON co.match_id = m.id
     WHERE (m.user_a_id = ?1 OR m.user_b_id = ?1) AND m.status = 'active'
     ORDER BY m.created_at DESC`,
  )
    .bind(user.id)
    .all<{ id: string; status: string; createdAt: string; conversationId: string; otherUserId: string }>();

  const matches = [];
  for (const row of results) {
    const profile = await c.env.DB.prepare(
      `SELECT id, display_name as displayName, avatar_url as avatarUrl FROM anonymous_profiles WHERE user_id = ?1`,
    )
      .bind(row.otherUserId)
      .first<{ id: string; displayName: string; avatarUrl: string | null }>();
    matches.push({
      id: row.id,
      status: row.status,
      createdAt: row.createdAt,
      conversationId: row.conversationId,
      other: profile,
    });
  }

  return ok(c, { matches });
});

matchRoutes.post("/", async (c) => {
  const user = c.get("user")!;
  const body = (await c.req.json().catch(() => null)) as { anonymousProfileId?: string } | null;
  if (!body?.anonymousProfileId) return fail(c, "INVALID_REQUEST", "anonymousProfileId is required.");

  const other = await c.env.DB.prepare(`SELECT user_id as userId FROM anonymous_profiles WHERE id = ?1`)
    .bind(body.anonymousProfileId)
    .first<{ userId: string }>();
  if (!other) return fail(c, "PROFILE_NOT_FOUND", "Profile not found.", 404);
  if (other.userId === user.id) return fail(c, "CANNOT_MATCH_SELF", "You can't connect with yourself.");

  const mutual = await hasMutualInterest(c.env, user.id, user.anonymousProfileId!, other.userId, body.anonymousProfileId);
  if (!mutual) {
    return fail(c, "NOT_MUTUAL", "You can only connect once you're both mutually interested.", 403);
  }

  const [userAId, userBId] = pairKey(user.id, other.userId);

  const existing = await c.env.DB.prepare(`SELECT id, status FROM matches WHERE user_a_id = ?1 AND user_b_id = ?2`)
    .bind(userAId, userBId)
    .first<{ id: string; status: string }>();

  if (existing) {
    if (existing.status === "unmatched" || existing.status === "blocked") {
      return fail(c, "MATCH_ENDED", "This connection has ended.", 409);
    }
    const conversation = await c.env.DB.prepare(`SELECT id FROM conversations WHERE match_id = ?1`)
      .bind(existing.id)
      .first<{ id: string }>();
    return ok(c, { matchId: existing.id, conversationId: conversation?.id });
  }

  const matchId = randomId();
  const conversationId = randomId();
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO matches (id, user_a_id, user_b_id, status) VALUES (?1, ?2, ?3, 'active')`).bind(
      matchId,
      userAId,
      userBId,
    ),
    c.env.DB.prepare(`INSERT INTO conversations (id, match_id) VALUES (?1, ?2)`).bind(conversationId, matchId),
  ]);

  await Promise.all([
    createNotification(c.env, user.id, "matched", { matchId, conversationId }),
    createNotification(c.env, other.userId, "matched", { matchId, conversationId }),
  ]);

  return ok(c, { matchId, conversationId }, 201);
});

matchRoutes.post("/:id/unmatch", async (c) => {
  const user = c.get("user")!;
  const matchId = c.req.param("id");

  const match = await c.env.DB.prepare(
    `SELECT id FROM matches WHERE id = ?1 AND (user_a_id = ?2 OR user_b_id = ?2) AND status = 'active'`,
  )
    .bind(matchId, user.id)
    .first();
  if (!match) return fail(c, "MATCH_NOT_FOUND", "Match not found.", 404);

  await c.env.DB.prepare(`UPDATE matches SET status = 'unmatched', updated_at = ?1 WHERE id = ?2`)
    .bind(new Date().toISOString(), matchId)
    .run();

  return ok(c, { status: "unmatched" });
});
