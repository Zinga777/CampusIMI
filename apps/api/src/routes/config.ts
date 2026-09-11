import { Hono } from "hono";
import {
  ACADEMIC_STATUS_LABELS,
  ACADEMIC_STATUS_OPTIONS,
  GENDER_LABELS,
  GENDER_OPTIONS,
  MAX_BIO_LENGTH,
  MAX_COMMENT_LENGTH,
  MAX_POST_LENGTH,
  POST_CATEGORIES,
  POST_CATEGORY_LABELS,
  REACTION_TYPES,
  REPORT_REASONS,
} from "@campusimi/shared";
import { ok } from "../lib/response.js";
import type { Env, Variables } from "../types.js";

export const configRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

configRoutes.get("/", (c) => {
  return ok(c, {
    collegeName: c.env.COLLEGE_NAME,
    academicStatusOptions: ACADEMIC_STATUS_OPTIONS.map((value) => ({
      value,
      label: ACADEMIC_STATUS_LABELS[value],
    })),
    genderOptions: GENDER_OPTIONS.map((value) => ({ value, label: GENDER_LABELS[value] })),
    postCategories: POST_CATEGORIES.map((value) => ({ value, label: POST_CATEGORY_LABELS[value] })),
    reactionTypes: REACTION_TYPES,
    reportReasons: REPORT_REASONS,
    limits: {
      maxPostLength: MAX_POST_LENGTH,
      maxCommentLength: MAX_COMMENT_LENGTH,
      maxBioLength: MAX_BIO_LENGTH,
    },
  });
});
