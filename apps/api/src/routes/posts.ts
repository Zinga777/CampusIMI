import { Hono } from "hono";
import { MAX_COMMENT_LENGTH, MAX_POST_LENGTH, POST_CATEGORIES, REACTION_TYPES } from "@campusimi/shared";
import { fail, ok } from "../lib/response.js";
import { randomId } from "../lib/crypto.js";
import { detectSensitiveInfo, detectUnverifiedAccusation } from "../lib/moderation.js";
import { trendingScore } from "../lib/trending.js";
import { requireProfile } from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const postRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

postRoutes.use("*", requireProfile);

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const TRENDING_WINDOW_DAYS = 14;
const TRENDING_CANDIDATE_LIMIT = 500;

interface PostRow {
  id: string;
  content: string;
  category: string | null;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  reactionCount: number;
  anonymousProfileId: string;
  displayName: string;
  avatarUrl: string | null;
  viewerHasLiked: number;
}

function serializePost(row: PostRow) {
  return {
    id: row.id,
    content: row.content,
    category: row.category,
    createdAt: row.createdAt,
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    reactionCount: row.reactionCount,
    author: {
      anonymousProfileId: row.anonymousProfileId,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
    },
    viewerHasLiked: row.viewerHasLiked === 1,
  };
}

function clampPageSize(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

postRoutes.get("/", async (c) => {
  const user = c.get("user")!;
  const mode = c.req.query("mode") ?? "trending";
  const category = c.req.query("category");
  const limit = clampPageSize(c.req.query("limit"));
  const offset = Math.max(0, Number(c.req.query("offset") ?? 0) || 0);

  if (category && !POST_CATEGORIES.includes(category as (typeof POST_CATEGORIES)[number])) {
    return fail(c, "INVALID_CATEGORY", "Unknown category.");
  }

  const categoryClause = category ? "AND p.category = ?2" : "";
  const bindings: unknown[] = [user.id];
  if (category) bindings.push(category);

  if (mode === "trending") {
    const windowStart = new Date(Date.now() - TRENDING_WINDOW_DAYS * 86_400_000).toISOString();
    const query = `
      SELECT p.id, p.content, p.category, p.created_at as createdAt,
             p.like_count as likeCount, p.comment_count as commentCount, p.reaction_count as reactionCount,
             p.anonymous_profile_id as anonymousProfileId, ap.display_name as displayName, ap.avatar_url as avatarUrl,
             CASE WHEN pl.user_id IS NOT NULL THEN 1 ELSE 0 END as viewerHasLiked
      FROM posts p
      JOIN anonymous_profiles ap ON ap.id = p.anonymous_profile_id
      LEFT JOIN post_likes pl ON pl.post_id = p.id AND pl.user_id = ?1
      WHERE p.status = 'published' AND p.created_at >= ?${category ? 3 : 2} ${categoryClause}
      ORDER BY p.created_at DESC
      LIMIT ${TRENDING_CANDIDATE_LIMIT}`;
    bindings.push(windowStart);

    const { results } = await c.env.DB.prepare(query).bind(...bindings).all<PostRow>();
    const now = new Date();
    const scored = results
      .map((row) => ({ row, score: trendingScore(row, now) }))
      .sort((a, b) => b.score - a.score || (a.row.createdAt < b.row.createdAt ? 1 : -1));
    const page = scored.slice(offset, offset + limit).map((s) => serializePost(s.row));
    return ok(c, { posts: page, nextOffset: offset + limit < scored.length ? offset + limit : null });
  }

  let orderBy = "p.created_at DESC";
  if (mode === "discussed") orderBy = "p.comment_count DESC, p.created_at DESC";
  else if (mode === "popular") orderBy = "(p.like_count + p.comment_count + p.reaction_count) DESC, p.created_at DESC";
  else if (mode !== "latest") return fail(c, "INVALID_MODE", "Unknown feed mode.");

  const limitParamIndex = category ? 3 : 2;
  const offsetParamIndex = category ? 4 : 3;
  const query = `
    SELECT p.id, p.content, p.category, p.created_at as createdAt,
           p.like_count as likeCount, p.comment_count as commentCount, p.reaction_count as reactionCount,
           p.anonymous_profile_id as anonymousProfileId, ap.display_name as displayName, ap.avatar_url as avatarUrl,
           CASE WHEN pl.user_id IS NOT NULL THEN 1 ELSE 0 END as viewerHasLiked
    FROM posts p
    JOIN anonymous_profiles ap ON ap.id = p.anonymous_profile_id
    LEFT JOIN post_likes pl ON pl.post_id = p.id AND pl.user_id = ?1
    WHERE p.status = 'published' ${categoryClause}
    ORDER BY ${orderBy}
    LIMIT ?${limitParamIndex} OFFSET ?${offsetParamIndex}`;
  bindings.push(limit, offset);

  const { results } = await c.env.DB.prepare(query).bind(...bindings).all<PostRow>();
  const posts = results.map(serializePost);
  return ok(c, { posts, nextOffset: results.length === limit ? offset + limit : null });
});

postRoutes.post("/", async (c) => {
  const user = c.get("user")!;
  const body = (await c.req.json().catch(() => null)) as
    | { content?: string; category?: string; confirmWarning?: boolean }
    | null;

  const content = body?.content?.trim();
  if (!content || content.length === 0) return fail(c, "EMPTY_CONTENT", "Post can't be empty.");
  if (content.length > MAX_POST_LENGTH) {
    return fail(c, "CONTENT_TOO_LONG", `Posts must be ${MAX_POST_LENGTH} characters or fewer.`);
  }
  if (body?.category && !POST_CATEGORIES.includes(body.category as (typeof POST_CATEGORIES)[number])) {
    return fail(c, "INVALID_CATEGORY", "Unknown category.");
  }

  const sensitive = detectSensitiveInfo(content);
  if (sensitive.blocked) return fail(c, "SENSITIVE_INFO", sensitive.reason!);

  const accusation = detectUnverifiedAccusation(content);
  if (accusation.reason && !body?.confirmWarning) {
    return ok(c, { needsConfirmation: true, warning: accusation.reason });
  }

  const id = randomId();
  await c.env.DB.prepare(
    `INSERT INTO posts (id, author_user_id, anonymous_profile_id, content, category)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(id, user.id, user.anonymousProfileId, content, body?.category ?? null)
    .run();

  return ok(c, { id }, 201);
});

postRoutes.post("/:id/like", async (c) => {
  const user = c.get("user")!;
  const postId = c.req.param("id");

  const post = await c.env.DB.prepare(`SELECT id FROM posts WHERE id = ?1 AND status = 'published'`)
    .bind(postId)
    .first();
  if (!post) return fail(c, "POST_NOT_FOUND", "Post not found.", 404);

  const already = await c.env.DB.prepare(`SELECT 1 FROM post_likes WHERE post_id = ?1 AND user_id = ?2`)
    .bind(postId, user.id)
    .first();
  if (already) return ok(c, { liked: true });

  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO post_likes (id, post_id, user_id) VALUES (?1, ?2, ?3)`).bind(
      randomId(),
      postId,
      user.id,
    ),
    c.env.DB.prepare(`UPDATE posts SET like_count = like_count + 1 WHERE id = ?1`).bind(postId),
  ]);

  return ok(c, { liked: true });
});

postRoutes.delete("/:id/like", async (c) => {
  const user = c.get("user")!;
  const postId = c.req.param("id");

  const existing = await c.env.DB.prepare(`SELECT 1 FROM post_likes WHERE post_id = ?1 AND user_id = ?2`)
    .bind(postId, user.id)
    .first();
  if (!existing) return ok(c, { liked: false });

  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM post_likes WHERE post_id = ?1 AND user_id = ?2`).bind(postId, user.id),
    c.env.DB.prepare(`UPDATE posts SET like_count = MAX(like_count - 1, 0) WHERE id = ?1`).bind(postId),
  ]);

  return ok(c, { liked: false });
});

postRoutes.post("/:id/react", async (c) => {
  const user = c.get("user")!;
  const postId = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as { reactionType?: string } | null;

  if (!body?.reactionType || !REACTION_TYPES.includes(body.reactionType as (typeof REACTION_TYPES)[number])) {
    return fail(c, "INVALID_REACTION", "Unknown reaction type.");
  }

  const post = await c.env.DB.prepare(`SELECT id FROM posts WHERE id = ?1 AND status = 'published'`)
    .bind(postId)
    .first();
  if (!post) return fail(c, "POST_NOT_FOUND", "Post not found.", 404);

  const existing = await c.env.DB.prepare(`SELECT reaction_type as reactionType FROM post_reactions WHERE post_id = ?1 AND user_id = ?2`)
    .bind(postId, user.id)
    .first<{ reactionType: string }>();

  if (existing) {
    if (existing.reactionType === body.reactionType) return ok(c, { reactionType: existing.reactionType });
    await c.env.DB.prepare(`UPDATE post_reactions SET reaction_type = ?1 WHERE post_id = ?2 AND user_id = ?3`)
      .bind(body.reactionType, postId, user.id)
      .run();
    return ok(c, { reactionType: body.reactionType });
  }

  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO post_reactions (id, post_id, user_id, reaction_type) VALUES (?1, ?2, ?3, ?4)`).bind(
      randomId(),
      postId,
      user.id,
      body.reactionType,
    ),
    c.env.DB.prepare(`UPDATE posts SET reaction_count = reaction_count + 1 WHERE id = ?1`).bind(postId),
  ]);

  return ok(c, { reactionType: body.reactionType });
});

postRoutes.delete("/:id/react", async (c) => {
  const user = c.get("user")!;
  const postId = c.req.param("id");

  const existing = await c.env.DB.prepare(`SELECT 1 FROM post_reactions WHERE post_id = ?1 AND user_id = ?2`)
    .bind(postId, user.id)
    .first();
  if (!existing) return ok(c, { removed: false });

  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM post_reactions WHERE post_id = ?1 AND user_id = ?2`).bind(postId, user.id),
    c.env.DB.prepare(`UPDATE posts SET reaction_count = MAX(reaction_count - 1, 0) WHERE id = ?1`).bind(postId),
  ]);

  return ok(c, { removed: true });
});

interface CommentRow {
  id: string;
  content: string;
  parentCommentId: string | null;
  createdAt: string;
  likeCount: number;
  anonymousProfileId: string;
  displayName: string;
  avatarUrl: string | null;
  viewerHasLiked: number;
}

function serializeComment(row: CommentRow) {
  return {
    id: row.id,
    content: row.content,
    parentCommentId: row.parentCommentId,
    createdAt: row.createdAt,
    likeCount: row.likeCount,
    author: {
      anonymousProfileId: row.anonymousProfileId,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
    },
    viewerHasLiked: row.viewerHasLiked === 1,
  };
}

postRoutes.get("/:id/comments", async (c) => {
  const user = c.get("user")!;
  const postId = c.req.param("id");
  const limit = clampPageSize(c.req.query("limit"));
  const offset = Math.max(0, Number(c.req.query("offset") ?? 0) || 0);

  const post = await c.env.DB.prepare(`SELECT id FROM posts WHERE id = ?1 AND status = 'published'`)
    .bind(postId)
    .first();
  if (!post) return fail(c, "POST_NOT_FOUND", "Post not found.", 404);

  const { results } = await c.env.DB.prepare(
    `SELECT cm.id, cm.content, cm.parent_comment_id as parentCommentId, cm.created_at as createdAt,
            cm.like_count as likeCount, cm.anonymous_profile_id as anonymousProfileId,
            ap.display_name as displayName, ap.avatar_url as avatarUrl,
            CASE WHEN cl.user_id IS NOT NULL THEN 1 ELSE 0 END as viewerHasLiked
     FROM comments cm
     JOIN anonymous_profiles ap ON ap.id = cm.anonymous_profile_id
     LEFT JOIN comment_likes cl ON cl.comment_id = cm.id AND cl.user_id = ?1
     WHERE cm.post_id = ?2 AND cm.status = 'published'
     ORDER BY cm.created_at ASC
     LIMIT ?3 OFFSET ?4`,
  )
    .bind(user.id, postId, limit, offset)
    .all<CommentRow>();

  const comments = results.map(serializeComment);
  return ok(c, { comments, nextOffset: results.length === limit ? offset + limit : null });
});

postRoutes.post("/:id/comments", async (c) => {
  const user = c.get("user")!;
  const postId = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as
    | { content?: string; parentCommentId?: string; confirmWarning?: boolean }
    | null;

  const content = body?.content?.trim();
  if (!content) return fail(c, "EMPTY_CONTENT", "Comment can't be empty.");
  if (content.length > MAX_COMMENT_LENGTH) {
    return fail(c, "CONTENT_TOO_LONG", `Comments must be ${MAX_COMMENT_LENGTH} characters or fewer.`);
  }

  const post = await c.env.DB.prepare(`SELECT id FROM posts WHERE id = ?1 AND status = 'published'`)
    .bind(postId)
    .first();
  if (!post) return fail(c, "POST_NOT_FOUND", "Post not found.", 404);

  if (body?.parentCommentId) {
    const parent = await c.env.DB.prepare(`SELECT id FROM comments WHERE id = ?1 AND post_id = ?2`)
      .bind(body.parentCommentId, postId)
      .first();
    if (!parent) return fail(c, "PARENT_COMMENT_NOT_FOUND", "That comment no longer exists.", 404);
  }

  const sensitive = detectSensitiveInfo(content);
  if (sensitive.blocked) return fail(c, "SENSITIVE_INFO", sensitive.reason!);

  const accusation = detectUnverifiedAccusation(content);
  if (accusation.reason && !body?.confirmWarning) {
    return ok(c, { needsConfirmation: true, warning: accusation.reason });
  }

  const id = randomId();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO comments (id, post_id, author_user_id, anonymous_profile_id, parent_comment_id, content)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    ).bind(id, postId, user.id, user.anonymousProfileId, body?.parentCommentId ?? null, content),
    c.env.DB.prepare(`UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?1`).bind(postId),
  ]);

  return ok(c, { id }, 201);
});
