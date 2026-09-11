import { Hono } from "hono";
import {
  ACADEMIC_STATUS_OPTIONS,
  GENDER_OPTIONS,
  MAX_BIO_LENGTH,
  RESERVED_DISPLAY_NAMES,
} from "@campusimi/shared";
import { fail, ok } from "../lib/response.js";
import { generateUniqueDisplayName } from "../lib/display-name.js";
import { detectSensitiveInfo, detectUnverifiedAccusation } from "../lib/moderation.js";
import { randomId } from "../lib/crypto.js";
import { requireAuth } from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const profileRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

profileRoutes.use("*", requireAuth);

const MAX_INTERESTS = 10;
const MAX_INTEREST_LENGTH = 30;
const MAX_COURSE_LENGTH = 80;

interface ProfileRow {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  academicStatus: string;
  gender: string;
  course: string | null;
  interests: string;
  createdAt: string;
  isSelf?: boolean;
}

interface ProfilePayload {
  academicStatus?: string;
  gender?: string;
  bio?: string | null;
  course?: string | null;
  interests?: unknown;
  displayName?: string;
}

function serializeProfile(row: ProfileRow) {
  let interests: string[] = [];
  try {
    interests = JSON.parse(row.interests);
  } catch {
    interests = [];
  }
  return {
    id: row.id,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    bio: row.bio,
    academicStatus: row.academicStatus,
    gender: row.gender,
    course: row.course,
    interests,
    createdAt: row.createdAt,
    ...(row.isSelf ? { isSelf: true } : {}),
  };
}

function validateOnboardingPayload(body: ProfilePayload | null): { error?: string } {
  if (!ACADEMIC_STATUS_OPTIONS.includes(body?.academicStatus as (typeof ACADEMIC_STATUS_OPTIONS)[number])) {
    return { error: "Please select your academic status." };
  }
  if (!GENDER_OPTIONS.includes(body?.gender as (typeof GENDER_OPTIONS)[number])) {
    return { error: "Please select a gender option." };
  }
  if (body?.bio !== undefined && body.bio !== null) {
    if (typeof body.bio !== "string" || body.bio.length > MAX_BIO_LENGTH) {
      return { error: `Bio must be ${MAX_BIO_LENGTH} characters or fewer.` };
    }
  }
  if (body?.course !== undefined && body.course !== null) {
    if (typeof body.course !== "string" || body.course.length > MAX_COURSE_LENGTH) {
      return { error: "Course name is too long." };
    }
  }
  if (body?.interests !== undefined) {
    if (
      !Array.isArray(body.interests) ||
      body.interests.length > MAX_INTERESTS ||
      body.interests.some((i: unknown) => typeof i !== "string" || i.length > MAX_INTEREST_LENGTH)
    ) {
      return { error: "Interests must be a list of short tags." };
    }
  }
  return {};
}

profileRoutes.get("/me", async (c) => {
  const user = c.get("user")!;
  const row = await c.env.DB.prepare(
    `SELECT id, display_name as displayName, avatar_url as avatarUrl, bio,
            academic_status as academicStatus, gender, course, interests, created_at as createdAt
     FROM anonymous_profiles WHERE user_id = ?1`,
  )
    .bind(user.id)
    .first<Omit<ProfileRow, "isSelf">>();

  if (!row) return fail(c, "PROFILE_NOT_FOUND", "No profile yet.", 404);
  return ok(c, serializeProfile({ ...row, isSelf: true }));
});

profileRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    `SELECT id, display_name as displayName, avatar_url as avatarUrl, bio,
            academic_status as academicStatus, gender, course, interests, created_at as createdAt
     FROM anonymous_profiles WHERE id = ?1 AND is_discoverable = 1`,
  )
    .bind(id)
    .first<Omit<ProfileRow, "isSelf">>();

  if (!row) return fail(c, "PROFILE_NOT_FOUND", "Profile not found.", 404);
  return ok(c, serializeProfile(row));
});

profileRoutes.post("/", async (c) => {
  const user = c.get("user")!;

  const existing = await c.env.DB.prepare(`SELECT id FROM anonymous_profiles WHERE user_id = ?1`)
    .bind(user.id)
    .first();
  if (existing) return fail(c, "PROFILE_ALREADY_EXISTS", "Your profile is already set up.", 409);

  const body = (await c.req.json().catch(() => null)) as ProfilePayload | null;
  const { error } = validateOnboardingPayload(body);
  if (error) return fail(c, "INVALID_PROFILE", error);

  const bio: string | null = body!.bio?.trim() || null;
  if (bio) {
    const sensitive = detectSensitiveInfo(bio);
    if (sensitive.blocked) return fail(c, "SENSITIVE_INFO", sensitive.reason!);
    // Unverified-accusation heuristic is advisory only here; still allowed through
    // for a bio (as opposed to a targeted post/comment), per moderation strategy.
    detectUnverifiedAccusation(bio);
  }

  const requestedName: string | undefined =
    typeof body!.displayName === "string" ? body!.displayName.trim() : undefined;
  let displayName: string;
  if (requestedName) {
    if (requestedName.length < 3 || requestedName.length > 24 || !/^[A-Za-z0-9_]+$/.test(requestedName)) {
      return fail(c, "INVALID_DISPLAY_NAME", "Display names must be 3-24 letters, numbers, or underscores.");
    }
    if (RESERVED_DISPLAY_NAMES.includes(requestedName.toLowerCase())) {
      return fail(c, "RESERVED_DISPLAY_NAME", "That display name is reserved. Please choose another.");
    }
    const taken = await c.env.DB.prepare(`SELECT 1 FROM anonymous_profiles WHERE display_name = ?1 COLLATE NOCASE`)
      .bind(requestedName)
      .first();
    if (taken) return fail(c, "DISPLAY_NAME_TAKEN", "That display name is already in use.");
    displayName = requestedName;
  } else {
    displayName = await generateUniqueDisplayName(c.env.DB);
  }

  const id = randomId();
  const interests = JSON.stringify(body!.interests ?? []);

  await c.env.DB.prepare(
    `INSERT INTO anonymous_profiles
       (id, user_id, display_name, bio, academic_status, gender, course, interests)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  )
    .bind(id, user.id, displayName, bio, body!.academicStatus, body!.gender, body!.course?.trim() || null, interests)
    .run();

  return ok(c, { id, displayName }, 201);
});

profileRoutes.put("/me", async (c) => {
  const user = c.get("user")!;
  const existing = await c.env.DB.prepare(`SELECT id FROM anonymous_profiles WHERE user_id = ?1`)
    .bind(user.id)
    .first<{ id: string }>();
  if (!existing) return fail(c, "PROFILE_NOT_FOUND", "Set up your profile first.", 404);

  const body = (await c.req.json().catch(() => null)) as ProfilePayload | null;
  const { error } = validateOnboardingPayload(body);
  if (error) return fail(c, "INVALID_PROFILE", error);

  const bio: string | null = body!.bio?.trim() || null;
  if (bio) {
    const sensitive = detectSensitiveInfo(bio);
    if (sensitive.blocked) return fail(c, "SENSITIVE_INFO", sensitive.reason!);
  }

  await c.env.DB.prepare(
    `UPDATE anonymous_profiles
     SET bio = ?1, academic_status = ?2, gender = ?3, course = ?4, interests = ?5, updated_at = ?6
     WHERE id = ?7`,
  )
    .bind(
      bio,
      body!.academicStatus,
      body!.gender,
      body!.course?.trim() || null,
      JSON.stringify(body!.interests ?? []),
      new Date().toISOString(),
      existing.id,
    )
    .run();

  return ok(c, { message: "Profile updated." });
});
