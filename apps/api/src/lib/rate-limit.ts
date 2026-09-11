import { randomId } from "./crypto.js";
import type { Env } from "../types.js";

export type RateLimitedAction = "post" | "comment" | "like" | "confession" | "message" | "ai_request";

const WINDOWS: Record<RateLimitedAction, { seconds: number; envVar: keyof Env }> = {
  post: { seconds: 3600, envVar: "RATE_LIMIT_POSTS_PER_HOUR" },
  comment: { seconds: 60, envVar: "RATE_LIMIT_COMMENTS_PER_MINUTE" },
  like: { seconds: 60, envVar: "RATE_LIMIT_LIKES_PER_MINUTE" },
  confession: { seconds: 3600, envVar: "RATE_LIMIT_CONFESSIONS_PER_HOUR" },
  message: { seconds: 60, envVar: "RATE_LIMIT_MESSAGES_PER_MINUTE" },
  ai_request: { seconds: 3600, envVar: "RATE_LIMIT_AI_PER_HOUR" },
};

/** Per-user (not per-IP — campus wifi shares IPs) sliding-window rate limiter backed by D1.
 * Returns { allowed: false } without recording when the user is already over the limit;
 * otherwise records the event and returns { allowed: true }. */
export async function checkAndRecordRateLimit(
  env: Env,
  userId: string,
  action: RateLimitedAction,
): Promise<{ allowed: boolean; limit: number }> {
  const { seconds, envVar } = WINDOWS[action];
  const limit = Number(env[envVar]) || Infinity;
  const windowStart = new Date(Date.now() - seconds * 1000).toISOString();

  const { count } = (await env.DB.prepare(
    `SELECT COUNT(*) as count FROM rate_limit_events WHERE user_id = ?1 AND action = ?2 AND created_at >= ?3`,
  )
    .bind(userId, action, windowStart)
    .first<{ count: number }>())!;

  if (count >= limit) return { allowed: false, limit };

  await env.DB.prepare(`INSERT INTO rate_limit_events (id, user_id, action) VALUES (?1, ?2, ?3)`)
    .bind(randomId(), userId, action)
    .run();

  return { allowed: true, limit };
}
