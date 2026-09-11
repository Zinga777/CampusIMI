import { randomId } from "./crypto.js";
import { createNotification } from "./notifications.js";
import type { Env } from "../types.js";

/** Matches are stored with the lexicographically smaller user id first so the
 * (user_a_id, user_b_id) pair is a stable, order-independent key for the UNIQUE lookup
 * below — used identically by both the confession-based and swipe-based match paths. */
export function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Creates the match + its conversation the first time two users become mutually
 * interested (via confession or swipe), or returns the existing one idempotently. A
 * previously unmatched/blocked pair can't be silently re-matched by re-triggering
 * mutual interest. */
export async function createMatch(
  env: Env,
  userAId: string,
  userBId: string,
): Promise<{ matchId: string; conversationId: string; ended?: true }> {
  const [a, b] = pairKey(userAId, userBId);

  const existing = await env.DB.prepare(`SELECT id, status FROM matches WHERE user_a_id = ?1 AND user_b_id = ?2`)
    .bind(a, b)
    .first<{ id: string; status: string }>();

  if (existing) {
    if (existing.status === "unmatched" || existing.status === "blocked") {
      return { matchId: existing.id, conversationId: "", ended: true };
    }
    const conversation = await env.DB.prepare(`SELECT id FROM conversations WHERE match_id = ?1`)
      .bind(existing.id)
      .first<{ id: string }>();
    return { matchId: existing.id, conversationId: conversation!.id };
  }

  const matchId = randomId();
  const conversationId = randomId();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO matches (id, user_a_id, user_b_id, status) VALUES (?1, ?2, ?3, 'active')`).bind(
      matchId,
      a,
      b,
    ),
    env.DB.prepare(`INSERT INTO conversations (id, match_id) VALUES (?1, ?2)`).bind(conversationId, matchId),
  ]);

  await Promise.all([
    createNotification(env, userAId, "matched", { matchId, conversationId }),
    createNotification(env, userBId, "matched", { matchId, conversationId }),
  ]);

  return { matchId, conversationId };
}
