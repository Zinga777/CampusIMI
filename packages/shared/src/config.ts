/**
 * Configurable, non-hard-coded product constants.
 * These are the defaults; the API reads the college-specific values
 * (name, domains, rate limits) from environment bindings at runtime and
 * the frontend fetches public config from `/api/v1/config`.
 */

export const ACADEMIC_STATUS_OPTIONS = ["junior", "senior"] as const;
export type AcademicStatus = (typeof ACADEMIC_STATUS_OPTIONS)[number];

export const ACADEMIC_STATUS_LABELS: Record<AcademicStatus, string> = {
  junior: "Junior",
  senior: "Senior",
};

export const GENDER_OPTIONS = [
  "male",
  "female",
  "non_binary",
  "prefer_not_to_say",
] as const;
export type Gender = (typeof GENDER_OPTIONS)[number];

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Male",
  female: "Female",
  non_binary: "Non-binary",
  prefer_not_to_say: "Prefer not to say",
};

export const POST_CATEGORIES = [
  "confession",
  "gossip",
  "campus",
  "rant",
  "question",
  "fun",
  "crush",
  "achievement",
  "event",
  "other",
] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];

export const POST_CATEGORY_LABELS: Record<PostCategory, string> = {
  confession: "Confession",
  gossip: "Gossip",
  campus: "Campus",
  rant: "Rant",
  question: "Question",
  fun: "Fun",
  crush: "Crush",
  achievement: "Achievement",
  event: "Event",
  other: "Other",
};

export const REACTION_TYPES = ["haha", "wow", "sad", "fire", "clap"] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

export const REPORT_REASONS = [
  "harassment",
  "bullying",
  "threat",
  "spam",
  "fake_account",
  "impersonation",
  "private_information",
  "sexual_content",
  "hate_abuse",
  "false_accusation",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const ACCOUNT_STATUSES = [
  "pending_verification",
  "pending_manual_review",
  "active",
  "suspended",
  "deleted",
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const CONTENT_STATUSES = [
  "published",
  "hidden",
  "under_review",
  "removed",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const DEFAULT_RATE_LIMITS = {
  postsPerHour: 10,
  commentsPerMinute: 5,
  likesPerMinute: 30,
  confessionsPerHour: 10,
  messagesPerMinute: 20,
  aiRequestsPerHour: 20,
} as const;

export const MAX_POST_LENGTH = 2000;
export const MAX_COMMENT_LENGTH = 1000;
export const MAX_BIO_LENGTH = 500;
export const MIN_PASSWORD_LENGTH = 8;

export const RESERVED_DISPLAY_NAMES = [
  "admin",
  "administrator",
  "moderator",
  "mod",
  "collegeofficial",
  "principal",
  "official",
  "support",
  "campusimi",
  "system",
  "staff",
  "dean",
];

/** Parses a comma-separated env var into a normalized (lowercase) domain set. */
export function parseCollegeDomains(raw: string | undefined | null): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowedCollegeEmail(email: string, allowedDomains: Set<string>): boolean {
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return allowedDomains.has(domain);
}
