import { randomId } from "./crypto.js";
import type { Env } from "../types.js";

/** Every admin/moderation action is written here — the accountability trail that
 * makes anonymity-with-backend-accountability possible. Never skip this call from an
 * admin route. */
export async function logAdminAction(
  env: Env,
  adminUserId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_logs (id, admin_user_id, action, target_type, target_id, metadata) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(randomId(), adminUserId, action, targetType, targetId, metadata ? JSON.stringify(metadata) : null)
    .run();
}
