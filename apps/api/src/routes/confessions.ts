import { Hono } from "hono";
import { fail, ok } from "../lib/response.js";
import { randomId } from "../lib/crypto.js";
import { detectSensitiveInfo } from "../lib/moderation.js";
import { checkAndRecordRateLimit } from "../lib/rate-limit.js";
import { createNotification } from "../lib/notifications.js";
import { requireProfile } from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const confessionRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

confessionRoutes.use("*", requireProfile);

const MAX_MESSAGE_LENGTH = 500;
const RESPONSE_VALUES = ["interested", "sweet", "not_interested"] as const;

/** After a positive response, checks whether the other side has *also* sent a
 * confession to this user and gotten an "interested" response — i.e. both sides
 * independently confessed interest and both were answered positively. That's the
 * "mutual interest" the spec asks for; actually creating the match/conversation is a
 * Phase 6 concern (POST /matches, once that ships). */
async function checkMutualInterest(
  env: Env,
  userAId: string,
  userAProfileId: string,
  userBId: string,
  userBProfileId: string,
): Promise<boolean> {
  const aToB = await env.DB.prepare(
    `SELECT cr.response FROM confessions cf
     JOIN confession_responses cr ON cr.confession_id = cf.id
     WHERE cf.sender_user_id = ?1 AND cf.recipient_profile_id = ?2 AND cr.response = 'interested'
     LIMIT 1`,
  )
    .bind(userAId, userBProfileId)
    .first();
  const bToA = await env.DB.prepare(
    `SELECT cr.response FROM confessions cf
     JOIN confession_responses cr ON cr.confession_id = cf.id
     WHERE cf.sender_user_id = ?1 AND cf.recipient_profile_id = ?2 AND cr.response = 'interested'
     LIMIT 1`,
  )
    .bind(userBId, userAProfileId)
    .first();
  return Boolean(aToB) && Boolean(bToA);
}

confessionRoutes.post("/", async (c) => {
  const user = c.get("user")!;
  const body = (await c.req.json().catch(() => null)) as
    | { recipientAnonymousProfileId?: string; message?: string }
    | null;

  const message = body?.message?.trim();
  if (!message) return fail(c, "EMPTY_MESSAGE", "Confession can't be empty.");
  if (message.length > MAX_MESSAGE_LENGTH) {
    return fail(c, "MESSAGE_TOO_LONG", `Confessions must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
  }
  if (!body?.recipientAnonymousProfileId) return fail(c, "INVALID_REQUEST", "recipientAnonymousProfileId is required.");

  if (body.recipientAnonymousProfileId === user.anonymousProfileId) {
    return fail(c, "CANNOT_CONFESS_TO_SELF", "You can't send a confession to yourself.");
  }

  const recipient = await c.env.DB.prepare(`SELECT user_id as userId FROM anonymous_profiles WHERE id = ?1`)
    .bind(body.recipientAnonymousProfileId)
    .first<{ userId: string }>();
  if (!recipient) return fail(c, "PROFILE_NOT_FOUND", "Profile not found.", 404);

  const blocked = await c.env.DB.prepare(
    `SELECT 1 FROM blocks WHERE (blocker_user_id = ?1 AND blocked_user_id = ?2) OR (blocker_user_id = ?2 AND blocked_user_id = ?1)`,
  )
    .bind(user.id, recipient.userId)
    .first();
  if (blocked) return fail(c, "BLOCKED", "You can't send a confession to this student.", 403);

  const sensitive = detectSensitiveInfo(message);
  if (sensitive.blocked) return fail(c, "SENSITIVE_INFO", sensitive.reason!);

  const rateLimit = await checkAndRecordRateLimit(c.env, user.id, "confession");
  if (!rateLimit.allowed) {
    return fail(c, "RATE_LIMITED", `You've reached the limit of ${rateLimit.limit} confessions per hour.`, 429);
  }

  const id = randomId();
  await c.env.DB.prepare(
    `INSERT INTO confessions (id, sender_user_id, recipient_profile_id, message) VALUES (?1, ?2, ?3, ?4)`,
  )
    .bind(id, user.id, body.recipientAnonymousProfileId, message)
    .run();

  await createNotification(c.env, recipient.userId, "confession_received", { confessionId: id });

  return ok(c, { id }, 201);
});

confessionRoutes.get("/received", async (c) => {
  const user = c.get("user")!;
  const { results } = await c.env.DB.prepare(
    `SELECT cf.id, cf.message, cf.created_at as createdAt, cr.response
     FROM confessions cf
     LEFT JOIN confession_responses cr ON cr.confession_id = cf.id
     WHERE cf.recipient_profile_id = ?1
     ORDER BY cf.created_at DESC`,
  )
    .bind(user.anonymousProfileId)
    .all();
  return ok(c, { confessions: results });
});

confessionRoutes.get("/sent", async (c) => {
  const user = c.get("user")!;
  const { results } = await c.env.DB.prepare(
    `SELECT cf.id, cf.message, cf.created_at as createdAt, cf.recipient_profile_id as recipientAnonymousProfileId,
            ap.display_name as recipientDisplayName, cr.response
     FROM confessions cf
     JOIN anonymous_profiles ap ON ap.id = cf.recipient_profile_id
     LEFT JOIN confession_responses cr ON cr.confession_id = cf.id
     WHERE cf.sender_user_id = ?1
     ORDER BY cf.created_at DESC`,
  )
    .bind(user.id)
    .all();
  return ok(c, { confessions: results });
});

confessionRoutes.post("/:id/respond", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as { response?: string } | null;

  if (!body?.response || !RESPONSE_VALUES.includes(body.response as (typeof RESPONSE_VALUES)[number])) {
    return fail(c, "INVALID_RESPONSE", "Please choose a valid response.");
  }

  const confession = await c.env.DB.prepare(
    `SELECT id, sender_user_id as senderUserId, recipient_profile_id as recipientProfileId
     FROM confessions WHERE id = ?1`,
  )
    .bind(id)
    .first<{ id: string; senderUserId: string; recipientProfileId: string }>();
  if (!confession) return fail(c, "CONFESSION_NOT_FOUND", "Confession not found.", 404);
  if (confession.recipientProfileId !== user.anonymousProfileId) {
    return fail(c, "FORBIDDEN", "You can't respond to this confession.", 403);
  }

  const existing = await c.env.DB.prepare(`SELECT 1 FROM confession_responses WHERE confession_id = ?1`)
    .bind(id)
    .first();
  if (existing) return fail(c, "ALREADY_RESPONDED", "You've already responded to this confession.", 409);

  await c.env.DB.prepare(
    `INSERT INTO confession_responses (id, confession_id, responder_user_id, response) VALUES (?1, ?2, ?3, ?4)`,
  )
    .bind(randomId(), id, user.id, body.response)
    .run();

  await createNotification(c.env, confession.senderUserId, "confession_responded", {
    confessionId: id,
    response: body.response,
  });

  if (body.response === "interested") {
    const sender = await c.env.DB.prepare(`SELECT id FROM anonymous_profiles WHERE user_id = ?1`)
      .bind(confession.senderUserId)
      .first<{ id: string }>();
    const mutual =
      sender !== null &&
      (await checkMutualInterest(c.env, confession.senderUserId, sender.id, user.id, user.anonymousProfileId!));
    if (mutual) {
      await Promise.all([
        createNotification(c.env, confession.senderUserId, "mutual_interest", { withProfileId: user.anonymousProfileId }),
        createNotification(c.env, user.id, "mutual_interest", { withProfileId: sender!.id }),
      ]);
      return ok(c, { response: body.response, mutualInterest: true });
    }
  }

  return ok(c, { response: body.response, mutualInterest: false });
});
