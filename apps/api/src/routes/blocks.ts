import { Hono } from "hono";
import { fail, ok } from "../lib/response.js";
import { randomId } from "../lib/crypto.js";
import { requireProfile } from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const blockRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

blockRoutes.use("*", requireProfile);

blockRoutes.get("/", async (c) => {
  const user = c.get("user")!;
  const { results } = await c.env.DB.prepare(
    `SELECT ap.id as anonymousProfileId, ap.display_name as displayName, b.created_at as createdAt
     FROM blocks b
     JOIN anonymous_profiles ap ON ap.user_id = b.blocked_user_id
     WHERE b.blocker_user_id = ?1
     ORDER BY b.created_at DESC`,
  )
    .bind(user.id)
    .all();
  return ok(c, { blocks: results });
});

blockRoutes.post("/", async (c) => {
  const user = c.get("user")!;
  const body = (await c.req.json().catch(() => null)) as { anonymousProfileId?: string } | null;
  if (!body?.anonymousProfileId) return fail(c, "INVALID_REQUEST", "anonymousProfileId is required.");

  // Server resolves the target's real user id itself — the client never supplies or
  // learns it, preserving anonymity while still letting the backend enforce blocks.
  const target = await c.env.DB.prepare(`SELECT user_id as userId FROM anonymous_profiles WHERE id = ?1`)
    .bind(body.anonymousProfileId)
    .first<{ userId: string }>();
  if (!target) return fail(c, "PROFILE_NOT_FOUND", "Profile not found.", 404);
  if (target.userId === user.id) return fail(c, "CANNOT_BLOCK_SELF", "You can't block yourself.");

  const existing = await c.env.DB.prepare(`SELECT 1 FROM blocks WHERE blocker_user_id = ?1 AND blocked_user_id = ?2`)
    .bind(user.id, target.userId)
    .first();
  if (existing) return ok(c, { blocked: true });

  await c.env.DB.prepare(`INSERT INTO blocks (id, blocker_user_id, blocked_user_id) VALUES (?1, ?2, ?3)`)
    .bind(randomId(), user.id, target.userId)
    .run();

  return ok(c, { blocked: true });
});

blockRoutes.delete("/:anonymousProfileId", async (c) => {
  const user = c.get("user")!;
  const anonymousProfileId = c.req.param("anonymousProfileId");

  const target = await c.env.DB.prepare(`SELECT user_id as userId FROM anonymous_profiles WHERE id = ?1`)
    .bind(anonymousProfileId)
    .first<{ userId: string }>();
  if (!target) return fail(c, "PROFILE_NOT_FOUND", "Profile not found.", 404);

  await c.env.DB.prepare(`DELETE FROM blocks WHERE blocker_user_id = ?1 AND blocked_user_id = ?2`)
    .bind(user.id, target.userId)
    .run();

  return ok(c, { blocked: false });
});
