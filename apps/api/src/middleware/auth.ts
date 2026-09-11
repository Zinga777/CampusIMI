import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { sha256Hex } from "../lib/crypto.js";
import { fail } from "../lib/response.js";
import type { Env, Variables } from "../types.js";

export const SESSION_COOKIE = "cimi_session";

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

/** Resolves the session cookie to a user and attaches it to context.
 * Never reads a user/profile id from the request body or query string. */
export async function resolveSession(c: AppContext, next: Next) {
  const token = getCookie(c, SESSION_COOKIE);
  c.set("user", null);
  c.set("admin", null);

  if (token) {
    const tokenHash = await sha256Hex(token);
    const now = new Date().toISOString();
    const row = await c.env.DB.prepare(
      `SELECT s.user_id as userId, u.account_status as accountStatus,
              p.id as profileId
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN anonymous_profiles p ON p.user_id = u.id
       WHERE s.id = ?1 AND s.expires_at > ?2`,
    )
      .bind(tokenHash, now)
      .first<{ userId: string; accountStatus: string; profileId: string | null }>();

    if (row) {
      c.set("user", {
        id: row.userId,
        accountStatus: row.accountStatus,
        hasProfile: row.profileId !== null,
        anonymousProfileId: row.profileId,
      });
    }
  }

  await next();
}

/** Requires an authenticated, active (or pending manual review resolved) user. */
export async function requireAuth(c: AppContext, next: Next) {
  const user = c.get("user");
  if (!user) return fail(c, "UNAUTHENTICATED", "Please sign in.", 401);
  if (user.accountStatus === "suspended") {
    return fail(c, "ACCOUNT_SUSPENDED", "Your account has been suspended.", 403);
  }
  if (user.accountStatus === "deleted") {
    return fail(c, "ACCOUNT_DELETED", "This account no longer exists.", 403);
  }
  if (user.accountStatus !== "active") {
    return fail(c, "ACCOUNT_NOT_ACTIVE", "Please complete verification first.", 403);
  }
  await next();
}

/** Requires an authenticated, active user who has completed anonymous profile
 * onboarding. This is the sole auth gate on most feature routes (posts, comments,
 * confessions, matches, events, AI, ...), so it re-checks account status itself
 * rather than assuming callers also apply requireAuth. */
export async function requireProfile(c: AppContext, next: Next) {
  const user = c.get("user");
  if (!user) return fail(c, "UNAUTHENTICATED", "Please sign in.", 401);
  if (user.accountStatus === "suspended") {
    return fail(c, "ACCOUNT_SUSPENDED", "Your account has been suspended.", 403);
  }
  if (user.accountStatus !== "active") {
    return fail(c, "ACCOUNT_NOT_ACTIVE", "Please complete verification first.", 403);
  }
  if (!user.hasProfile) {
    return fail(c, "PROFILE_REQUIRED", "Please finish setting up your anonymous profile.", 403);
  }
  await next();
}
