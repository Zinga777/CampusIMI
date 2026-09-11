import { Hono } from "hono";
import { fail, ok } from "../lib/response.js";
import { randomId } from "../lib/crypto.js";
import { matchesImageSignature } from "../lib/file-signature.js";
import { requireAuth } from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const mediaRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

// Public read: avatars are meant to be visible in the anonymous feed.
mediaRoutes.get("/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const object = await c.env.MEDIA.get(key);
  if (!object) return fail(c, "NOT_FOUND", "Not found.", 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      // Never let a browser re-sniff and reinterpret user-uploaded content as
      // something else (e.g. HTML/script) regardless of the declared Content-Type.
      "X-Content-Type-Options": "nosniff",
    },
  });
});

mediaRoutes.post("/avatar", requireAuth, async (c) => {
  const user = c.get("user")!;
  const contentType = c.req.header("content-type") ?? "";
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) {
    return fail(c, "INVALID_FILE_TYPE", "Avatar must be a PNG, JPEG, or WebP image.");
  }

  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return fail(c, "EMPTY_FILE", "No file received.");
  if (bytes.byteLength > MAX_AVATAR_BYTES) {
    return fail(c, "FILE_TOO_LARGE", "Avatars must be 2MB or smaller.");
  }
  // Never trust the client-supplied Content-Type alone — verify the bytes actually
  // are the image format claimed before storing and later serving them back.
  if (!matchesImageSignature(bytes, contentType)) {
    return fail(c, "INVALID_FILE_TYPE", "File content doesn't match a PNG, JPEG, or WebP image.");
  }

  const previous = await c.env.DB.prepare(`SELECT avatar_url as avatarUrl FROM anonymous_profiles WHERE user_id = ?1`)
    .bind(user.id)
    .first<{ avatarUrl: string | null }>();

  const key = `avatars/${user.id}/${randomId()}.${ext}`;
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType } });

  const avatarUrl = `/api/v1/media/${key}`;
  await c.env.DB.prepare(`UPDATE anonymous_profiles SET avatar_url = ?1, updated_at = ?2 WHERE user_id = ?3`)
    .bind(avatarUrl, new Date().toISOString(), user.id)
    .run();

  // Clean up the old avatar object now that the profile no longer references it.
  const previousKey = previous?.avatarUrl?.replace(/^\/api\/v1\/media\//, "");
  if (previousKey && previousKey.startsWith(`avatars/${user.id}/`)) {
    await c.env.MEDIA.delete(previousKey).catch(() => {});
  }

  return ok(c, { avatarUrl });
});
