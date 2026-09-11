import { Hono } from "hono";
import { fail, ok } from "../lib/response.js";
import { requireProfile } from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const notificationRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

notificationRoutes.use("*", requireProfile);

notificationRoutes.get("/", async (c) => {
  const user = c.get("user")!;
  const { results } = await c.env.DB.prepare(
    `SELECT id, type, payload, is_read as isRead, created_at as createdAt
     FROM notifications WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(user.id)
    .all<{ id: string; type: string; payload: string | null; isRead: number; createdAt: string }>();

  const notifications = results.map((n) => ({
    id: n.id,
    type: n.type,
    payload: n.payload ? JSON.parse(n.payload) : null,
    isRead: n.isRead === 1,
    createdAt: n.createdAt,
  }));
  return ok(c, { notifications });
});

notificationRoutes.post("/:id/read", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(`SELECT id FROM notifications WHERE id = ?1 AND user_id = ?2`)
    .bind(id, user.id)
    .first();
  if (!row) return fail(c, "NOT_FOUND", "Notification not found.", 404);

  await c.env.DB.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ?1`).bind(id).run();
  return ok(c, { isRead: true });
});

notificationRoutes.post("/read-all", async (c) => {
  const user = c.get("user")!;
  await c.env.DB.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?1 AND is_read = 0`)
    .bind(user.id)
    .run();
  return ok(c, { message: "All notifications marked read." });
});
