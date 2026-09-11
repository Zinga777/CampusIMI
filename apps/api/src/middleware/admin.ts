import type { Context, Next } from "hono";
import { fail } from "../lib/response.js";
import type { Env, Variables } from "../types.js";

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

/** Requires the current session's user to be a registered admin/moderator.
 * Never trusts a client-supplied role — always re-checks admin_users server-side. */
export async function requireAdmin(c: AppContext, next: Next) {
  const user = c.get("user");
  if (!user) return fail(c, "UNAUTHENTICATED", "Please sign in.", 401);

  const row = await c.env.DB.prepare(`SELECT role FROM admin_users WHERE user_id = ?1`)
    .bind(user.id)
    .first<{ role: "moderator" | "admin" }>();

  if (!row) return fail(c, "FORBIDDEN", "Admin access required.", 403);

  c.set("admin", { userId: user.id, role: row.role });
  await next();
}
