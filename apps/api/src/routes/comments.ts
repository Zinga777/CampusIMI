import { Hono } from "hono";
import { fail, ok } from "../lib/response.js";
import { randomId } from "../lib/crypto.js";
import { requireProfile } from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const commentRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

commentRoutes.use("*", requireProfile);

commentRoutes.post("/:id/like", async (c) => {
  const user = c.get("user")!;
  const commentId = c.req.param("id");

  const comment = await c.env.DB.prepare(`SELECT id FROM comments WHERE id = ?1 AND status = 'published'`)
    .bind(commentId)
    .first();
  if (!comment) return fail(c, "COMMENT_NOT_FOUND", "Comment not found.", 404);

  const already = await c.env.DB.prepare(`SELECT 1 FROM comment_likes WHERE comment_id = ?1 AND user_id = ?2`)
    .bind(commentId, user.id)
    .first();
  if (already) return ok(c, { liked: true });

  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO comment_likes (id, comment_id, user_id) VALUES (?1, ?2, ?3)`).bind(
      randomId(),
      commentId,
      user.id,
    ),
    c.env.DB.prepare(`UPDATE comments SET like_count = like_count + 1 WHERE id = ?1`).bind(commentId),
  ]);

  return ok(c, { liked: true });
});

commentRoutes.delete("/:id/like", async (c) => {
  const user = c.get("user")!;
  const commentId = c.req.param("id");

  const existing = await c.env.DB.prepare(`SELECT 1 FROM comment_likes WHERE comment_id = ?1 AND user_id = ?2`)
    .bind(commentId, user.id)
    .first();
  if (!existing) return ok(c, { liked: false });

  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM comment_likes WHERE comment_id = ?1 AND user_id = ?2`).bind(commentId, user.id),
    c.env.DB.prepare(`UPDATE comments SET like_count = MAX(like_count - 1, 0) WHERE id = ?1`).bind(commentId),
  ]);

  return ok(c, { liked: false });
});
