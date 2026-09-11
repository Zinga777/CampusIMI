export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;

  COLLEGE_NAME: string;
  COLLEGE_EMAIL_DOMAINS: string;
  SESSION_SECRET: string;
  OTP_TTL_MINUTES: string;
  SESSION_TTL_DAYS: string;
  AI_API_KEY?: string;
  AI_PROVIDER: string;

  RATE_LIMIT_POSTS_PER_HOUR: string;
  RATE_LIMIT_COMMENTS_PER_MINUTE: string;
  RATE_LIMIT_LIKES_PER_MINUTE: string;
  RATE_LIMIT_CONFESSIONS_PER_HOUR: string;
  RATE_LIMIT_MESSAGES_PER_MINUTE: string;
  RATE_LIMIT_AI_PER_HOUR: string;
}

export interface AuthedUser {
  id: string;
  accountStatus: string;
  hasProfile: boolean;
  anonymousProfileId: string | null;
}

/** Hono variable map for this app. */
export type Variables = {
  user: AuthedUser | null;
};
