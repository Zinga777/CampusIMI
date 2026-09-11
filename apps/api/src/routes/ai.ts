import { Hono, type Context } from "hono";
import { MAX_POST_LENGTH } from "@campusimi/shared";
import { fail, ok } from "../lib/response.js";
import { checkAndRecordRateLimit } from "../lib/rate-limit.js";
import { rewritePost, suggestBio, suggestConversationStarters, suggestDatePlans } from "../lib/ai.js";
import { requireAuth, requireProfile } from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const aiRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Bio suggestions are needed during onboarding, before a profile exists, so this
// group only requires an authenticated account; the other AI features act on an
// existing profile/conversation and require one.
aiRoutes.use("*", requireAuth);

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

async function withRateLimit(c: AppContext, run: () => Promise<Response>): Promise<Response> {
  const user = c.get("user")!;
  const rateLimit = await checkAndRecordRateLimit(c.env, user.id, "ai_request");
  if (!rateLimit.allowed) {
    return fail(c, "RATE_LIMITED", `You've reached the limit of ${rateLimit.limit} AI requests per hour.`, 429);
  }
  return run();
}

interface ParticipantContext {
  sharedInterests: string[];
}

/** Loads shared interests for the two participants of a conversation, verifying the
 * caller is actually one of them first (same IDOR check as the messaging routes). */
async function loadConversationContext(env: Env, conversationId: string, userId: string): Promise<ParticipantContext | null> {
  const match = await env.DB.prepare(
    `SELECT m.user_a_id as userAId, m.user_b_id as userBId FROM conversations co
     JOIN matches m ON m.id = co.match_id
     WHERE co.id = ?1 AND m.status = 'active' AND (m.user_a_id = ?2 OR m.user_b_id = ?2)`,
  )
    .bind(conversationId, userId)
    .first<{ userAId: string; userBId: string }>();
  if (!match) return null;

  const otherId = match.userAId === userId ? match.userBId : match.userAId;
  const [mine, theirs] = await Promise.all([
    env.DB.prepare(`SELECT interests FROM anonymous_profiles WHERE user_id = ?1`).bind(userId).first<{ interests: string }>(),
    env.DB.prepare(`SELECT interests FROM anonymous_profiles WHERE user_id = ?1`).bind(otherId).first<{ interests: string }>(),
  ]);

  const mineList: string[] = mine ? JSON.parse(mine.interests) : [];
  const theirsList: string[] = theirs ? JSON.parse(theirs.interests) : [];
  const sharedInterests = mineList.filter((i) => theirsList.includes(i));
  return { sharedInterests };
}

aiRoutes.post("/bio", (c) =>
  withRateLimit(c, async () => {
    const user = c.get("user")!;
    const body = (await c.req.json().catch(() => null)) as { interests?: string[]; course?: string } | null;

    let interests: string[] | null = Array.isArray(body?.interests)
      ? body!.interests.filter((i) => typeof i === "string")
      : null;
    let course: string | null = typeof body?.course === "string" ? body!.course : null;

    // Onboarding hasn't created a profile yet, so accept interests/course from the
    // form directly; once a profile exists, fall back to it when the client omits them.
    if (interests === null) {
      const profile = await c.env.DB.prepare(`SELECT interests, course FROM anonymous_profiles WHERE user_id = ?1`)
        .bind(user.id)
        .first<{ interests: string; course: string | null }>();
      interests = profile ? (JSON.parse(profile.interests) as string[]) : [];
      course = profile?.course ?? null;
    }

    const suggestions = await suggestBio(c.env, interests, course);
    return ok(c, { suggestions });
  }),
);

aiRoutes.post("/rewrite-post", requireProfile, (c) =>
  withRateLimit(c, async () => {
    const body = (await c.req.json().catch(() => null)) as { content?: string } | null;
    const content = body?.content?.trim();
    if (!content) return fail(c, "EMPTY_CONTENT", "Nothing to rewrite.");
    if (content.length > MAX_POST_LENGTH) return fail(c, "CONTENT_TOO_LONG", "Post is too long to rewrite.");
    const suggestions = await rewritePost(c.env, content);
    return ok(c, { suggestions });
  }),
);

aiRoutes.post("/conversation-starters", requireProfile, (c) =>
  withRateLimit(c, async () => {
    const user = c.get("user")!;
    const body = (await c.req.json().catch(() => null)) as { conversationId?: string } | null;
    if (!body?.conversationId) return fail(c, "INVALID_REQUEST", "conversationId is required.");
    const context = await loadConversationContext(c.env, body.conversationId, user.id);
    if (!context) return fail(c, "FORBIDDEN", "You don't have access to this conversation.", 403);
    const suggestions = await suggestConversationStarters(c.env, context.sharedInterests);
    return ok(c, { suggestions });
  }),
);

aiRoutes.post("/date-plan", requireProfile, (c) =>
  withRateLimit(c, async () => {
    const user = c.get("user")!;
    const body = (await c.req.json().catch(() => null)) as { conversationId?: string } | null;
    if (!body?.conversationId) return fail(c, "INVALID_REQUEST", "conversationId is required.");
    const context = await loadConversationContext(c.env, body.conversationId, user.id);
    if (!context) return fail(c, "FORBIDDEN", "You don't have access to this conversation.", 403);
    const suggestions = await suggestDatePlans(c.env, context.sharedInterests);
    return ok(c, { suggestions });
  }),
);
