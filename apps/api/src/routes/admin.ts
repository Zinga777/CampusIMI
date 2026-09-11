import { Hono, type Context } from "hono";
import { fail, ok } from "../lib/response.js";
import { randomId } from "../lib/crypto.js";
import { logAdminAction } from "../lib/audit.js";
import { requireAdmin } from "../middleware/admin.js";
import type { Env, Variables } from "../types.js";

export const adminRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

// Bootstrapping the very first admin is the one admin action that doesn't require an
// existing admin — but it only ever works once (while admin_users is empty) and still
// requires the caller to be signed in, so it can't be used to silently escalate later.
adminRoutes.post("/bootstrap", async (c) => {
  const user = c.get("user");
  if (!user) return fail(c, "UNAUTHENTICATED", "Please sign in.", 401);

  const existingAdmin = await c.env.DB.prepare(`SELECT 1 FROM admin_users LIMIT 1`).first();
  if (existingAdmin) return fail(c, "ALREADY_BOOTSTRAPPED", "An admin already exists.", 409);

  await c.env.DB.prepare(`INSERT INTO admin_users (id, user_id, role) VALUES (?1, ?2, 'admin')`)
    .bind(randomId(), user.id)
    .run();

  await logAdminAction(c.env, user.id, "bootstrap_admin", "user", user.id);
  return ok(c, { message: "You are now an admin." });
});

adminRoutes.use("*", requireAdmin);

adminRoutes.get("/me", async (c) => {
  const admin = c.get("admin")!;
  return ok(c, { role: admin.role });
});

adminRoutes.get("/stats", async (c) => {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayStartIso = dayStart.toISOString();

  const [students, verified, postsToday, commentsToday, matches, reports, pendingReports] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM users`).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM users WHERE is_verified = 1`).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM posts WHERE created_at >= ?1`).bind(dayStartIso).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM comments WHERE created_at >= ?1`).bind(dayStartIso).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM matches`)
      .first<{ n: number }>()
      .catch(() => ({ n: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM reports`).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM reports WHERE status = 'open'`).first<{ n: number }>(),
  ]);

  return ok(c, {
    totalStudents: students?.n ?? 0,
    verifiedStudents: verified?.n ?? 0,
    postsToday: postsToday?.n ?? 0,
    commentsToday: commentsToday?.n ?? 0,
    matches: matches?.n ?? 0,
    totalReports: reports?.n ?? 0,
    pendingReports: pendingReports?.n ?? 0,
  });
});

adminRoutes.get("/reports", async (c) => {
  const status = c.req.query("status") ?? "open";
  const { results } = await c.env.DB.prepare(
    `SELECT id, reporter_user_id as reporterUserId, content_type as contentType, content_id as contentId,
            reason, description, status, created_at as createdAt
     FROM reports WHERE status = ?1 ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(status)
    .all();
  return ok(c, { reports: results });
});

adminRoutes.post("/reports/:id/resolve", async (c) => {
  const admin = c.get("admin")!;
  const reportId = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as { outcome?: "resolved" | "dismissed" } | null;
  const outcome = body?.outcome === "dismissed" ? "dismissed" : "resolved";

  const report = await c.env.DB.prepare(`SELECT id FROM reports WHERE id = ?1`).bind(reportId).first();
  if (!report) return fail(c, "REPORT_NOT_FOUND", "Report not found.", 404);

  await c.env.DB.prepare(`UPDATE reports SET status = ?1, resolved_at = ?2, resolved_by = ?3 WHERE id = ?4`)
    .bind(outcome, new Date().toISOString(), admin.userId, reportId)
    .run();

  await logAdminAction(c.env, admin.userId, `report_${outcome}`, "report", reportId);
  return ok(c, { status: outcome });
});

async function setContentStatus(
  c: AppContext,
  table: "posts" | "comments",
  id: string,
  status: "published" | "hidden" | "under_review" | "removed",
  action: string,
) {
  const admin = c.get("admin")!;
  const row = await c.env.DB.prepare(`SELECT id FROM ${table} WHERE id = ?1`).bind(id).first();
  if (!row) return fail(c, "NOT_FOUND", "Content not found.", 404);

  await c.env.DB.prepare(`UPDATE ${table} SET status = ?1, updated_at = ?2 WHERE id = ?3`)
    .bind(status, new Date().toISOString(), id)
    .run();

  await logAdminAction(c.env, admin.userId, action, table === "posts" ? "post" : "comment", id);
  return ok(c, { status });
}

adminRoutes.post("/posts/:id/hide", (c) => setContentStatus(c, "posts", c.req.param("id"), "hidden", "hide_post"));
adminRoutes.post("/posts/:id/remove", (c) => setContentStatus(c, "posts", c.req.param("id"), "removed", "remove_post"));
adminRoutes.post("/posts/:id/restore", (c) => setContentStatus(c, "posts", c.req.param("id"), "published", "restore_post"));

adminRoutes.delete("/posts/:id", async (c) => {
  const admin = c.get("admin")!;
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(`SELECT id FROM posts WHERE id = ?1`).bind(id).first();
  if (!row) return fail(c, "NOT_FOUND", "Post not found.", 404);
  await c.env.DB.prepare(`DELETE FROM posts WHERE id = ?1`).bind(id).run();
  await logAdminAction(c.env, admin.userId, "delete_post", "post", id);
  return ok(c, { deleted: true });
});

adminRoutes.post("/comments/:id/hide", (c) => setContentStatus(c, "comments", c.req.param("id"), "hidden", "hide_comment"));
adminRoutes.post("/comments/:id/remove", (c) => setContentStatus(c, "comments", c.req.param("id"), "removed", "remove_comment"));
adminRoutes.post("/comments/:id/restore", (c) => setContentStatus(c, "comments", c.req.param("id"), "published", "restore_comment"));

adminRoutes.delete("/comments/:id", async (c) => {
  const admin = c.get("admin")!;
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(`SELECT id FROM comments WHERE id = ?1`).bind(id).first();
  if (!row) return fail(c, "NOT_FOUND", "Comment not found.", 404);
  await c.env.DB.prepare(`DELETE FROM comments WHERE id = ?1`).bind(id).run();
  await logAdminAction(c.env, admin.userId, "delete_comment", "comment", id);
  return ok(c, { deleted: true });
});

adminRoutes.get("/posts", async (c) => {
  const status = c.req.query("status");
  const limit = Math.min(Number(c.req.query("limit")) || 50, 100);
  const query = status
    ? `SELECT p.id, p.content, p.category, p.status, p.author_user_id as authorUserId,
              p.like_count as likeCount, p.comment_count as commentCount, p.created_at as createdAt
       FROM posts p WHERE p.status = ?1 ORDER BY p.created_at DESC LIMIT ?2`
    : `SELECT p.id, p.content, p.category, p.status, p.author_user_id as authorUserId,
              p.like_count as likeCount, p.comment_count as commentCount, p.created_at as createdAt
       FROM posts p ORDER BY p.created_at DESC LIMIT ?1`;
  const stmt = status ? c.env.DB.prepare(query).bind(status, limit) : c.env.DB.prepare(query).bind(limit);
  const { results } = await stmt.all();
  return ok(c, { posts: results });
});

adminRoutes.get("/comments", async (c) => {
  const status = c.req.query("status");
  const limit = Math.min(Number(c.req.query("limit")) || 50, 100);
  const query = status
    ? `SELECT id, post_id as postId, content, status, author_user_id as authorUserId, created_at as createdAt
       FROM comments WHERE status = ?1 ORDER BY created_at DESC LIMIT ?2`
    : `SELECT id, post_id as postId, content, status, author_user_id as authorUserId, created_at as createdAt
       FROM comments ORDER BY created_at DESC LIMIT ?1`;
  const stmt = status ? c.env.DB.prepare(query).bind(status, limit) : c.env.DB.prepare(query).bind(limit);
  const { results } = await stmt.all();
  return ok(c, { comments: results });
});

adminRoutes.get("/events", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, title, location, starts_at as startsAt, status, created_by_user_id as createdByUserId, created_at as createdAt
     FROM events ORDER BY starts_at DESC LIMIT 100`,
  ).all();
  return ok(c, { events: results });
});

adminRoutes.post("/events/:id/remove", async (c) => {
  const admin = c.get("admin")!;
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(`SELECT id FROM events WHERE id = ?1`).bind(id).first();
  if (!row) return fail(c, "NOT_FOUND", "Event not found.", 404);
  await c.env.DB.prepare(`UPDATE events SET status = 'removed' WHERE id = ?1`).bind(id).run();
  await logAdminAction(c.env, admin.userId, "remove_event", "event", id);
  return ok(c, { status: "removed" });
});

adminRoutes.get("/users", async (c) => {
  const status = c.req.query("status");
  const query = status
    ? `SELECT id, account_status as accountStatus, is_verified as isVerified, created_at as createdAt, last_active_at as lastActiveAt
       FROM users WHERE account_status = ?1 ORDER BY created_at DESC LIMIT 200`
    : `SELECT id, account_status as accountStatus, is_verified as isVerified, created_at as createdAt, last_active_at as lastActiveAt
       FROM users ORDER BY created_at DESC LIMIT 200`;
  const stmt = status ? c.env.DB.prepare(query).bind(status) : c.env.DB.prepare(query);
  const { results } = await stmt.all();
  return ok(c, { users: results });
});

// Suspension is always a deliberate human action — never automated on report count.
adminRoutes.post("/users/:id/suspend", async (c) => {
  const admin = c.get("admin")!;
  const userId = c.req.param("id");
  const user = await c.env.DB.prepare(`SELECT id FROM users WHERE id = ?1`).bind(userId).first();
  if (!user) return fail(c, "USER_NOT_FOUND", "User not found.", 404);

  await c.env.DB.prepare(`UPDATE users SET account_status = 'suspended', updated_at = ?1 WHERE id = ?2`)
    .bind(new Date().toISOString(), userId)
    .run();
  await c.env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?1`).bind(userId).run();

  await logAdminAction(c.env, admin.userId, "suspend_user", "user", userId);
  return ok(c, { accountStatus: "suspended" });
});

adminRoutes.post("/users/:id/unsuspend", async (c) => {
  const admin = c.get("admin")!;
  const userId = c.req.param("id");
  const user = await c.env.DB.prepare(`SELECT id FROM users WHERE id = ?1 AND account_status = 'suspended'`)
    .bind(userId)
    .first();
  if (!user) return fail(c, "USER_NOT_FOUND", "Suspended user not found.", 404);

  await c.env.DB.prepare(`UPDATE users SET account_status = 'active', updated_at = ?1 WHERE id = ?2`)
    .bind(new Date().toISOString(), userId)
    .run();

  await logAdminAction(c.env, admin.userId, "unsuspend_user", "user", userId);
  return ok(c, { accountStatus: "active" });
});

adminRoutes.get("/audit-logs", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, admin_user_id as adminUserId, action, target_type as targetType, target_id as targetId,
            metadata, created_at as createdAt
     FROM audit_logs ORDER BY created_at DESC LIMIT 200`,
  ).all();
  return ok(c, { auditLogs: results });
});
