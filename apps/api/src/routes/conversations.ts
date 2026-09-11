import { Hono } from "hono";
import { fail, ok } from "../lib/response.js";
import { requireProfile } from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const conversationRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

conversationRoutes.use("*", requireProfile);

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

  if (!(await assertParticipant(c.env, conversationId, user.id))) {
    return fail(c, "FORBIDDEN", "You don't have access to this conversation.", 403);
  }

  const query = before
    ? `SELECT id, sender_user_id as senderUserId, message, created_at as createdAt, read_at as readAt
       FROM messages WHERE conversation_id = ?1 AND deleted_at IS NULL AND created_at < ?2
       ORDER BY created_at DESC LIMIT ?3`
    : `SELECT id, sender_user_id as senderUserId, message, created_at as createdAt, read_at as readAt
       FROM messages WHERE conversation_id = ?1 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT ?2`;
  const stmt = before
    ? c.env.DB.prepare(query).bind(conversationId, before, limit)
    : c.env.DB.prepare(query).bind(conversationId, limit);

  const { results } = await stmt.all<{
    id: string;
    senderUserId: string;
    message: string;
    createdAt: string;
    readAt: string | null;
  }>();

  // Only the viewer's own messages ever reveal their own senderUserId back to
  // themselves as "isMine" — the other party's real user id is never serialized.
  const messages = results
    .map((m) => ({
      id: m.id,
      message: m.message,
      createdAt: m.createdAt,
      isMine: m.senderUserId === user.id,
      readAt: m.readAt,
    }))
    .reverse();

  await c.env.DB.prepare(
    `UPDATE messages SET read_at = ?1 WHERE conversation_id = ?2 AND sender_user_id != ?3 AND read_at IS NULL`,
  )
    .bind(new Date().toISOString(), conversationId, user.id)
    .run();

  return ok(c, { messages });
});

conversationRoutes.get("/:id/ws", async (c) => {
  const user = c.get("user")!;
  const conversationId = c.req.param("id");

  if (!(await assertParticipant(c.env, conversationId, user.id))) {
    return fail(c, "FORBIDDEN", "You don't have access to this conversation.", 403);
  }
  if (c.req.header("Upgrade") !== "websocket") {
    return fail(c, "UPGRADE_REQUIRED", "This endpoint only accepts WebSocket connections.", 426);
  }

  const doId = c.env.CHAT_ROOMS.idFromName(conversationId);
  const stub = c.env.CHAT_ROOMS.get(doId);

  const forwardUrl = new URL(c.req.url);
  forwardUrl.searchParams.set("conversationId", conversationId);

  const forwardRequest = new Request(forwardUrl.toString(), c.req.raw);
  forwardRequest.headers.set("X-User-Id", user.id);
  forwardRequest.headers.set("X-Profile-Id", user.anonymousProfileId!);

  return stub.fetch(forwardRequest);
});
