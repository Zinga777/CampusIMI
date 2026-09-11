import { Hono } from "hono";
import { fail, ok } from "../lib/response.js";
import { randomId } from "../lib/crypto.js";
import { detectSensitiveInfo } from "../lib/moderation.js";
import { requireProfile } from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const eventRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

eventRoutes.use("*", requireProfile);

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_LOCATION_LENGTH = 120;

eventRoutes.get("/", async (c) => {
  const user = c.get("user")!;
  const upcomingOnly = c.req.query("upcoming") !== "false";
  const now = new Date().toISOString();

  const query = upcomingOnly
    ? `SELECT e.id, e.title, e.description, e.location, e.starts_at as startsAt, e.created_at as createdAt,
              e.anonymous_profile_id as anonymousProfileId, ap.display_name as displayName,
              (SELECT COUNT(*) FROM event_participants ep WHERE ep.event_id = e.id) as participantCount,
              EXISTS(SELECT 1 FROM event_participants ep WHERE ep.event_id = e.id AND ep.user_id = ?1) as viewerInterested
       FROM events e
       JOIN anonymous_profiles ap ON ap.id = e.anonymous_profile_id
       WHERE e.status = 'published' AND e.starts_at >= ?2
       ORDER BY e.starts_at ASC LIMIT 100`
    : `SELECT e.id, e.title, e.description, e.location, e.starts_at as startsAt, e.created_at as createdAt,
              e.anonymous_profile_id as anonymousProfileId, ap.display_name as displayName,
              (SELECT COUNT(*) FROM event_participants ep WHERE ep.event_id = e.id) as participantCount,
              EXISTS(SELECT 1 FROM event_participants ep WHERE ep.event_id = e.id AND ep.user_id = ?1) as viewerInterested
       FROM events e
       JOIN anonymous_profiles ap ON ap.id = e.anonymous_profile_id
       WHERE e.status = 'published'
       ORDER BY e.starts_at DESC LIMIT 100`;

  const { results } = await c.env.DB.prepare(query).bind(user.id, now).all();
  return ok(c, { events: results });
});

eventRoutes.post("/", async (c) => {
  const user = c.get("user")!;
  const body = (await c.req.json().catch(() => null)) as
    | { title?: string; description?: string; location?: string; startsAt?: string }
    | null;

  const title = body?.title?.trim();
  if (!title) return fail(c, "INVALID_TITLE", "Event title is required.");
  if (title.length > MAX_TITLE_LENGTH) return fail(c, "TITLE_TOO_LONG", `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`);

  const description = body?.description?.trim() || null;
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    return fail(c, "DESCRIPTION_TOO_LONG", `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`);
  }
  const location = body?.location?.trim() || null;
  if (location && location.length > MAX_LOCATION_LENGTH) {
    return fail(c, "LOCATION_TOO_LONG", `Location must be ${MAX_LOCATION_LENGTH} characters or fewer.`);
  }

  const startsAt = body?.startsAt ? new Date(body.startsAt) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    return fail(c, "INVALID_START_TIME", "Please provide a valid start time.");
  }

  for (const text of [title, description, location].filter((t): t is string => Boolean(t))) {
    const sensitive = detectSensitiveInfo(text);
    if (sensitive.blocked) return fail(c, "SENSITIVE_INFO", sensitive.reason!);
  }

  const id = randomId();
  await c.env.DB.prepare(
    `INSERT INTO events (id, created_by_user_id, anonymous_profile_id, title, description, location, starts_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(id, user.id, user.anonymousProfileId, title, description, location, startsAt.toISOString())
    .run();

  return ok(c, { id }, 201);
});

eventRoutes.get("/:id", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");

  const event = await c.env.DB.prepare(
    `SELECT e.id, e.title, e.description, e.location, e.starts_at as startsAt, e.created_at as createdAt,
            e.anonymous_profile_id as anonymousProfileId, ap.display_name as displayName,
            (SELECT COUNT(*) FROM event_participants ep WHERE ep.event_id = e.id) as participantCount,
            EXISTS(SELECT 1 FROM event_participants ep WHERE ep.event_id = e.id AND ep.user_id = ?2) as viewerInterested
     FROM events e
     JOIN anonymous_profiles ap ON ap.id = e.anonymous_profile_id
     WHERE e.id = ?1 AND e.status = 'published'`,
  )
    .bind(id, user.id)
    .first();

  if (!event) return fail(c, "EVENT_NOT_FOUND", "Event not found.", 404);
  return ok(c, event);
});

eventRoutes.post("/:id/interested", async (c) => {
  const user = c.get("user")!;
  const eventId = c.req.param("id");

  const event = await c.env.DB.prepare(`SELECT id FROM events WHERE id = ?1 AND status = 'published'`)
    .bind(eventId)
    .first();
  if (!event) return fail(c, "EVENT_NOT_FOUND", "Event not found.", 404);

  const existing = await c.env.DB.prepare(`SELECT 1 FROM event_participants WHERE event_id = ?1 AND user_id = ?2`)
    .bind(eventId, user.id)
    .first();
  if (!existing) {
    await c.env.DB.prepare(`INSERT INTO event_participants (id, event_id, user_id) VALUES (?1, ?2, ?3)`)
      .bind(randomId(), eventId, user.id)
      .run();
  }

  return ok(c, { interested: true });
});

eventRoutes.delete("/:id/interested", async (c) => {
  const user = c.get("user")!;
  const eventId = c.req.param("id");

  await c.env.DB.prepare(`DELETE FROM event_participants WHERE event_id = ?1 AND user_id = ?2`)
    .bind(eventId, user.id)
    .run();

  return ok(c, { interested: false });
});
