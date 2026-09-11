import { Hono } from "hono";
import { REPORT_REASONS } from "@campusimi/shared";
import { fail, ok } from "../lib/response.js";
import { randomId } from "../lib/crypto.js";
import { requireProfile } from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const reportRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

reportRoutes.use("*", requireProfile);

const CONTENT_TYPES = ["post", "comment", "anonymous_profile", "message"] as const;

async function contentExists(env: Env, contentType: (typeof CONTENT_TYPES)[number], contentId: string): Promise<boolean> {
  const table = {
    post: "posts",
    comment: "comments",
    anonymous_profile: "anonymous_profiles",
    message: "messages",
  }[contentType];
  const row = await env.DB.prepare(`SELECT id FROM ${table} WHERE id = ?1`).bind(contentId).first();
  return row !== null;
}

reportRoutes.post("/", async (c) => {
  const user = c.get("user")!;
  const body = (await c.req.json().catch(() => null)) as
    | { contentType?: string; contentId?: string; reason?: string; description?: string }
    | null;

  if (!body?.contentType || !CONTENT_TYPES.includes(body.contentType as (typeof CONTENT_TYPES)[number])) {
    return fail(c, "INVALID_CONTENT_TYPE", "Unknown content type.");
  }
  if (!body.contentId) return fail(c, "INVALID_REQUEST", "contentId is required.");
  if (!body.reason || !REPORT_REASONS.includes(body.reason as (typeof REPORT_REASONS)[number])) {
    return fail(c, "INVALID_REASON", "Please select a valid report reason.");
  }
  if (body.description && body.description.length > 1000) {
    return fail(c, "DESCRIPTION_TOO_LONG", "Description must be 1000 characters or fewer.");
  }

  const exists = await contentExists(c.env, body.contentType as (typeof CONTENT_TYPES)[number], body.contentId);
  if (!exists) return fail(c, "CONTENT_NOT_FOUND", "That content no longer exists.", 404);

  const id = randomId();
  await c.env.DB.prepare(
    `INSERT INTO reports (id, reporter_user_id, content_type, content_id, reason, description)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(id, user.id, body.contentType, body.contentId, body.reason, body.description?.trim() || null)
    .run();

  return ok(c, { id }, 201);
});
