import { Hono } from "hono";
import { fail, ok } from "../lib/response.js";
import { randomId } from "../lib/crypto.js";
import { detectSensitiveInfo } from "../lib/moderation.js";
import { createNotification } from "../lib/notifications.js";
import { checkAndRecordRateLimit } from "../lib/rate-limit.js";
import { requireProfile } from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const conversationRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

conversationRoutes.use("*", requireProfile);

const MAX_MESSAGE_LENGTH = 1000;

/** The one IDOR check every route below depends on: does this conversation exist, is
 * its match active, and is the current session's user actually one of its two
 * participants? Never trust the conversation id alone. */
async function assertParticipant(env: Env, conversationId: string, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 FROM conversations co
     JOIN matches m ON m.id = co.match_id
     WHERE co.id = ?1 AND m.status = 'active' AND (m.user_a_id = ?2 OR m.user_b_id = ?2)`,
  )
    .bind(conversationId, userId)
    .first();
  return row !== null;
}

conversationRoutes.get("/:id/messages", async (c) => {
  const user = c.get("user")!;
  const conversationId = c.req.param("id");
  const limit = Math.min(Number(c.req.query("limit")) || 50, 100);
  const before = c.req.query("before");
  const after = c.req.query("after");

  if (!(await assertParticipant(c.env, conversationId, user.id))) {
    return fail(c, "FORBIDDEN", "You don't have access to this conversation.", 403);
  }

  // `after` powers polling for new messages since the last one the client has seen
  // (ascending order, so new messages append in place); `before` powers loading
  // older history (descending, then reversed); with neither, the most recent page.
  let query: string;
  let bindings: unknown[];
  if (after) {
    query = `SELECT id, sender_user_id as senderUserId, message, created_at as createdAt, read_at as readAt
             FROM messages WHERE conversation_id = ?1 AND deleted_at IS NULL AND created_at > ?2
             ORDER BY created_at ASC LIMIT ?3`;
    bindings = [conversationId, after, limit];
  } else if (before) {
    query = `SELECT id, sender_user_id as senderUserId, message, created_at as createdAt, read_at as readAt
             FROM messages WHERE conversation_id = ?1 AND deleted_at IS NULL AND created_at < ?2
             ORDER BY created_at DESC LIMIT ?3`;
    bindings = [conversationId, before, limit];
  } else {
    query = `SELECT id, sender_user_id as senderUserId, message, created_at as createdAt, read_at as readAt
             FROM messages WHERE conversation_id = ?1 AND deleted_at IS NULL
             ORDER BY created_at DESC LIMIT ?2`;
    bindings = [conversationId, limit];
  }

  const { results } = await c.env.DB.prepare(query)
    .bind(...bindings)
    .all<{
      id: string;
      senderUserId: string;
      message: string;
      createdAt: string;
      readAt: string | null;
    }>();

  // Only the viewer's own messages ever reveal their own senderUserId back to
  // themselves as "isMine" — the other party's real user id is never serialized.
  const ordered = after ? results : results.reverse();
  const messages = ordered.map((m) => ({
    id: m.id,
    message: m.message,
    createdAt: m.createdAt,
    isMine: m.senderUserId === user.id,
    readAt: m.readAt,
  }));

  await c.env.DB.prepare(
    `UPDATE messages SET read_at = ?1 WHERE conversation_id = ?2 AND sender_user_id != ?3 AND read_at IS NULL`,
  )
    .bind(new Date().toISOString(), conversationId, user.id)
    .run();

  return ok(c, { messages });
});

conversationRoutes.post("/:id/messages", async (c) => {
  const user = c.get("user")!;
  const conversationId = c.req.param("id");

  if (!(await assertParticipant(c.env, conversationId, user.id))) {
    return fail(c, "FORBIDDEN", "You don't have access to this conversation.", 403);
  }

  const body = (await c.req.json().catch(() => null)) as { message?: string; confirmWarning?: boolean } | null;
  const message = body?.message?.trim();
  if (!message) return fail(c, "EMPTY_MESSAGE", "Message can't be empty.");
  if (message.length > MAX_MESSAGE_LENGTH) {
    return fail(c, "MESSAGE_TOO_LONG", `Messages must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
  }

  // Never block a matched pair from choosing to exchange real contact info — just
  // make sure it's a deliberate choice, since sharing this hands the other person a
  // way to identify/track them outside the anonymous system.
  const sensitive = detectSensitiveInfo(message);
  if (sensitive.blocked && !body?.confirmWarning) {
    return ok(c, {
      needsConfirmation: true,
      warning: `${sensitive.reason} Sharing this could let the other person identify or track you outside the app.`,
    });
  }

  const rateLimit = await checkAndRecordRateLimit(c.env, user.id, "message");
  if (!rateLimit.allowed) {
    return fail(c, "RATE_LIMITED", `You've reached the limit of ${rateLimit.limit} messages per minute.`, 429);
  }

  const id = randomId();
  const createdAt = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO messages (id, conversation_id, sender_user_id, message, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(id, conversationId, user.id, message, createdAt)
    .run();

  return ok(c, { id, message, createdAt, isMine: true }, 201);
});

/** Resolves the conversation's match and the other participant in one IDOR-safe
 * lookup, reusing the same active-match + participant check as assertParticipant. */
async function getMatchAndOther(
  env: Env,
  conversationId: string,
  userId: string,
): Promise<{ matchId: string; otherUserId: string } | null> {
  const row = await env.DB.prepare(
    `SELECT m.id as matchId, CASE WHEN m.user_a_id = ?2 THEN m.user_b_id ELSE m.user_a_id END as otherUserId
     FROM conversations co
     JOIN matches m ON m.id = co.match_id
     WHERE co.id = ?1 AND m.status = 'active' AND (m.user_a_id = ?2 OR m.user_b_id = ?2)`,
  )
    .bind(conversationId, userId)
    .first<{ matchId: string; otherUserId: string }>();
  return row ?? null;
}

// Reveal order is deliberately not "safest info first": gender leads because it's the
// single strongest driver of curiosity in a match, so a mutual yes on it early builds
// momentum (reciprocity) for the rest; interests follow since a shared hobby is a
// low-stakes, natural conversation hook; academic status and course are the most
// "profile card"-like and least identity-sensitive, so they close out the set. It's
// still opt-in per field and per side, in any order — this is just the display order.
const REVEAL_FIELDS = ["gender", "interests", "academicStatus", "course"] as const;
type RevealField = (typeof REVEAL_FIELDS)[number];

interface OtherProfileRow {
  gender: string;
  academicStatus: string;
  course: string | null;
  interests: string;
}

// Both people start fully anonymous beyond avatar + bio, even after matching. Either
// side can opt in to reveal one of their own hidden fields; it only becomes visible to
// *both* once *both* have opted in for that field — the same mutual-consent shape the
// confession "mutual interest" check already uses, applied per field instead of once.
conversationRoutes.get("/:id/reveals", async (c) => {
  const user = c.get("user")!;
  const conversationId = c.req.param("id");

  const match = await getMatchAndOther(c.env, conversationId, user.id);
  if (!match) return fail(c, "FORBIDDEN", "You don't have access to this conversation.", 403);
  const { matchId, otherUserId } = match;

  const [mine, theirs, otherProfile] = await Promise.all([
    c.env.DB.prepare(`SELECT field FROM profile_reveals WHERE match_id = ?1 AND user_id = ?2`)
      .bind(matchId, user.id)
      .all<{ field: string }>(),
    c.env.DB.prepare(`SELECT field FROM profile_reveals WHERE match_id = ?1 AND user_id = ?2`)
      .bind(matchId, otherUserId)
      .all<{ field: string }>(),
    c.env.DB.prepare(
      `SELECT gender, academic_status as academicStatus, course, interests FROM anonymous_profiles WHERE user_id = ?1`,
    )
      .bind(otherUserId)
      .first<OtherProfileRow>(),
  ]);

  const mineSet = new Set(mine.results.map((r) => r.field));
  const theirsSet = new Set(theirs.results.map((r) => r.field));

  const reveals = REVEAL_FIELDS.map((field) => {
    const iOptedIn = mineSet.has(field);
    const theyOptedIn = theirsSet.has(field);
    const revealed = iOptedIn && theyOptedIn;
    let value: unknown = null;
    if (revealed && otherProfile) {
      value = field === "interests" ? JSON.parse(otherProfile.interests || "[]") : otherProfile[field];
    }
    return { field, iOptedIn, theyOptedIn, revealed, value };
  });

  return ok(c, { reveals });
});

conversationRoutes.post("/:id/reveals", async (c) => {
  const user = c.get("user")!;
  const conversationId = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as { field?: string } | null;

  if (!body?.field || !REVEAL_FIELDS.includes(body.field as RevealField)) {
    return fail(c, "INVALID_FIELD", "field must be one of gender, interests, academicStatus, course.");
  }

  const match = await getMatchAndOther(c.env, conversationId, user.id);
  if (!match) return fail(c, "FORBIDDEN", "You don't have access to this conversation.", 403);
  const { matchId, otherUserId } = match;

  await c.env.DB.prepare(
    `INSERT INTO profile_reveals (id, match_id, user_id, field) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(match_id, user_id, field) DO NOTHING`,
  )
    .bind(randomId(), matchId, user.id, body.field)
    .run();

  const theirOptIn = await c.env.DB.prepare(
    `SELECT 1 FROM profile_reveals WHERE match_id = ?1 AND user_id = ?2 AND field = ?3`,
  )
    .bind(matchId, otherUserId, body.field)
    .first();

  const revealed = Boolean(theirOptIn);
  if (revealed) {
    await Promise.all([
      createNotification(c.env, user.id, "profile_revealed", { matchId, field: body.field }),
      createNotification(c.env, otherUserId, "profile_revealed", { matchId, field: body.field }),
    ]);
  }

  return ok(c, { field: body.field, revealed });
});
