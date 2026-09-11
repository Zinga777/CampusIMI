import { Hono } from "hono";
import { MAX_POST_LENGTH, POST_CATEGORIES } from "@campusimi/shared";
import { fail, ok } from "../lib/response.js";
import { randomId } from "../lib/crypto.js";
import { detectSensitiveInfo } from "../lib/moderation.js";
import { matchesImageSignature } from "../lib/file-signature.js";
import { checkAndRecordRateLimit } from "../lib/rate-limit.js";
import { requireProfile } from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const postRequestRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

postRequestRoutes.use("*", requireProfile);

const MAX_LINK_LENGTH = 500;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

interface PostRequestRow {
  id: string;
  content: string;
  category: string | null;
  requestType: string;
  linkUrl: string | null;
  imageUrl: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
}

function serialize(row: PostRequestRow) {
  return {
    id: row.id,
    content: row.content,
    category: row.category,
    requestType: row.requestType,
    linkUrl: row.linkUrl,
    imageUrl: row.imageUrl,
    status: row.status,
    adminNote: row.adminNote,
    createdAt: row.createdAt,
  };
}

// Anyone can post plain text directly; a link, poster/image, or an urgent broadcast
// instead goes through this admin-reviewed queue — see lib/moderation.ts detectLink for
// why regular posts reject links outright, and routes/admin-post-requests.ts for review.
postRequestRoutes.post("/", async (c) => {
  const user = c.get("user")!;
  const body = (await c.req.json().catch(() => null)) as
    | { content?: string; category?: string; linkUrl?: string; requestType?: string }
    | null;

  const content = body?.content?.trim();
  if (!content) return fail(c, "EMPTY_CONTENT", "Request content can't be empty.");
  if (content.length > MAX_POST_LENGTH) {
    return fail(c, "CONTENT_TOO_LONG", `Requests must be ${MAX_POST_LENGTH} characters or fewer.`);
  }
  if (body?.category && !POST_CATEGORIES.includes(body.category as (typeof POST_CATEGORIES)[number])) {
    return fail(c, "INVALID_CATEGORY", "Unknown category.");
  }
  const requestType = body?.requestType === "urgent" ? "urgent" : "promotion";
  const linkUrl = body?.linkUrl?.trim() || null;
  if (linkUrl && linkUrl.length > MAX_LINK_LENGTH) {
    return fail(c, "LINK_TOO_LONG", `Links must be ${MAX_LINK_LENGTH} characters or fewer.`);
  }

  const sensitive = detectSensitiveInfo(content);
  if (sensitive.blocked) return fail(c, "SENSITIVE_INFO", sensitive.reason!);

  const rateLimit = await checkAndRecordRateLimit(c.env, user.id, "post");
  if (!rateLimit.allowed) {
    return fail(c, "RATE_LIMITED", `You've reached the limit of ${rateLimit.limit} requests per hour.`, 429);
  }

  const id = randomId();
  await c.env.DB.prepare(
    `INSERT INTO post_requests (id, author_user_id, anonymous_profile_id, request_type, content, category, link_url)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(id, user.id, user.anonymousProfileId, requestType, content, body?.category ?? null, linkUrl)
    .run();

  return ok(c, { id, status: "pending" }, 201);
});

// Attaches an image/poster to a request the caller owns, while it's still pending.
postRequestRoutes.post("/:id/image", async (c) => {
  const user = c.get("user")!;
  const requestId = c.req.param("id");

  const request = await c.env.DB.prepare(
    `SELECT id FROM post_requests WHERE id = ?1 AND author_user_id = ?2 AND status = 'pending'`,
  )
    .bind(requestId, user.id)
    .first();
  if (!request) return fail(c, "REQUEST_NOT_FOUND", "Pending request not found.", 404);

  const contentType = c.req.header("content-type") ?? "";
  const ext = ALLOWED_IMAGE_TYPES[contentType];
  if (!ext) return fail(c, "INVALID_FILE_TYPE", "Image must be a PNG, JPEG, or WebP file.");

  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return fail(c, "EMPTY_FILE", "No file received.");
  if (bytes.byteLength > MAX_IMAGE_BYTES) return fail(c, "FILE_TOO_LARGE", "Images must be 5MB or smaller.");
  if (!matchesImageSignature(bytes, contentType)) {
    return fail(c, "INVALID_FILE_TYPE", "File content doesn't match a PNG, JPEG, or WebP image.");
  }

  const key = `post-requests/${user.id}/${requestId}.${ext}`;
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType } });
  const imageUrl = `/api/v1/media/${key}`;

  await c.env.DB.prepare(`UPDATE post_requests SET image_url = ?1 WHERE id = ?2`).bind(imageUrl, requestId).run();

  return ok(c, { imageUrl });
});

postRequestRoutes.get("/mine", async (c) => {
  const user = c.get("user")!;
  const { results } = await c.env.DB.prepare(
    `SELECT id, content, category, request_type as requestType, link_url as linkUrl, image_url as imageUrl,
            status, admin_note as adminNote, created_at as createdAt
     FROM post_requests WHERE author_user_id = ?1 ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(user.id)
    .all<PostRequestRow>();

  return ok(c, { requests: results.map(serialize) });
});
