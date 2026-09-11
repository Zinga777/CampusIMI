import { randomId } from "./crypto.js";
import type { Env } from "../types.js";

export async function createNotification(
  env: Env,
  userId: string,
  type: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  await env.DB.prepare(`INSERT INTO notifications (id, user_id, type, payload) VALUES (?1, ?2, ?3, ?4)`)
    .bind(randomId(), userId, type, payload ? JSON.stringify(payload) : null)
    .run();
}
