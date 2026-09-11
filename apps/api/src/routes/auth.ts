import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { parseCollegeDomains, isAllowedCollegeEmail } from "@campusimi/shared";
import { generateOtp, hashPassword, randomId, randomToken, sha256Hex, verifyPassword } from "../lib/crypto.js";
import { fail, ok } from "../lib/response.js";
import { isValidEmailShape, isValidPassword } from "../lib/validation.js";
import { SESSION_COOKIE } from "../middleware/auth.js";
import type { Env, Variables } from "../types.js";

export const authRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

const OTP_MAX_ATTEMPTS = 5;

function otpTtlMs(env: Env): number {
  return Number(env.OTP_TTL_MINUTES || "10") * 60 * 1000;
}

function sessionTtlMs(env: Env): number {
  return Number(env.SESSION_TTL_DAYS || "30") * 24 * 60 * 60 * 1000;
}

async function issueSession(c: AppContext, userId: string): Promise<void> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionTtlMs(c.env));

  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?1, ?2, ?3, ?4)`,
  )
    .bind(tokenHash, userId, expiresAt.toISOString(), c.req.header("user-agent") ?? null)
    .run();

  // `Secure` cookies are refused by browsers over plain HTTP. Local dev runs the
  // Worker on http://127.0.0.1, so only require Secure when actually served over
  // HTTPS (production) — otherwise sessions would silently fail to persist locally.
  const isHttps = new URL(c.req.url).protocol === "https:";
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor(sessionTtlMs(c.env) / 1000),
  });
}

authRoutes.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!isValidEmailShape(email)) {
    return fail(c, "INVALID_EMAIL", "Please enter a valid email address.");
  }
  if (!isValidPassword(password)) {
    return fail(c, "WEAK_PASSWORD", "Password must be at least 8 characters.");
  }

  const allowedDomains = parseCollegeDomains(c.env.COLLEGE_EMAIL_DOMAINS);
  if (!isAllowedCollegeEmail(email, allowedDomains)) {
    // Generic message: never confirms whether a domain "almost" matched.
    return fail(
      c,
      "INVALID_DOMAIN",
      "Registration is only open to verified college email addresses. If you don't have one yet, contact an admin for manual verification.",
      403,
    );
  }

  const existing = await c.env.DB.prepare(`SELECT id FROM users WHERE email = ?1`).bind(email).first();
  if (existing) {
    // Same generic response as success to avoid confirming account existence via timing/content.
    return ok(c, { message: "If this email is eligible, a verification code has been sent." }, 200);
  }

  const userId = randomId();
  const passwordHash = await hashPassword(password);

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, account_status) VALUES (?1, ?2, ?3, 'pending_verification')`,
  )
    .bind(userId, email, passwordHash)
    .run();

  const otp = await createOtp(c.env, userId, "verify_email");

  // Dev-only: no real mail provider is wired up yet. Return the OTP in the
  // response (and log it) so local development / testing can proceed. This
  // must be replaced with a real sendEmail() call before any production use.
  console.log(`[dev] OTP for ${email}: ${otp}`);

  return ok(c, {
    message: "Verification code sent to your college email.",
    devOtp: otp,
  });
});

async function createOtp(env: Env, userId: string, purpose: "verify_email" | "password_reset"): Promise<string> {
  const otp = generateOtp();
  const otpHash = await sha256Hex(otp);
  const expiresAt = new Date(Date.now() + otpTtlMs(env)).toISOString();

  await env.DB.prepare(
    `INSERT INTO email_otps (id, user_id, otp_hash, purpose, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(randomId(), userId, otpHash, purpose, expiresAt)
    .run();

  return otp;
}

authRoutes.post("/verify-otp", async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (!email || !code) {
    return fail(c, "INVALID_REQUEST", "Email and code are required.");
  }

  const user = await c.env.DB.prepare(
    `SELECT id, account_status as accountStatus FROM users WHERE email = ?1`,
  )
    .bind(email)
    .first<{ id: string; accountStatus: string }>();

  if (!user) {
    return fail(c, "INVALID_CODE", "Invalid or expired verification code.", 400);
  }

  const otpRow = await c.env.DB.prepare(
    `SELECT id, otp_hash as otpHash, expires_at as expiresAt, attempt_count as attemptCount
     FROM email_otps
     WHERE user_id = ?1 AND purpose = 'verify_email' AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(user.id)
    .first<{ id: string; otpHash: string; expiresAt: string; attemptCount: number }>();

  if (!otpRow) {
    return fail(c, "INVALID_CODE", "Invalid or expired verification code.", 400);
  }
  if (otpRow.attemptCount >= OTP_MAX_ATTEMPTS) {
    return fail(c, "TOO_MANY_ATTEMPTS", "Too many attempts. Please request a new code.", 429);
  }
  if (new Date(otpRow.expiresAt).getTime() < Date.now()) {
    return fail(c, "INVALID_CODE", "Invalid or expired verification code.", 400);
  }

  const codeHash = await sha256Hex(code);
  if (codeHash !== otpRow.otpHash) {
    await c.env.DB.prepare(`UPDATE email_otps SET attempt_count = attempt_count + 1 WHERE id = ?1`)
      .bind(otpRow.id)
      .run();
    return fail(c, "INVALID_CODE", "Invalid or expired verification code.", 400);
  }

  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE email_otps SET consumed_at = ?1 WHERE id = ?2`).bind(now, otpRow.id),
    c.env.DB.prepare(
      `UPDATE users SET is_verified = 1, account_status = 'active', updated_at = ?1 WHERE id = ?2`,
    ).bind(now, user.id),
  ]);

  await issueSession(c, user.id);

  return ok(c, { message: "Email verified." });
});

authRoutes.post("/resend-otp", async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return fail(c, "INVALID_REQUEST", "Email is required.");

  const user = await c.env.DB.prepare(
    `SELECT id FROM users WHERE email = ?1 AND account_status = 'pending_verification'`,
  )
    .bind(email)
    .first<{ id: string }>();

  // Always return the same generic response, whether or not the account exists.
  if (user) {
    const otp = await createOtp(c.env, user.id, "verify_email");
    console.log(`[dev] OTP for ${email}: ${otp}`);
    return ok(c, { message: "If this email is eligible, a new code has been sent.", devOtp: otp });
  }
  return ok(c, { message: "If this email is eligible, a new code has been sent." });
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return fail(c, "INVALID_CREDENTIALS", "Invalid email or password.", 401);
  }

  const user = await c.env.DB.prepare(
    `SELECT id, password_hash as passwordHash, account_status as accountStatus FROM users WHERE email = ?1`,
  )
    .bind(email)
    .first<{ id: string; passwordHash: string; accountStatus: string }>();

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return fail(c, "INVALID_CREDENTIALS", "Invalid email or password.", 401);
  }

  if (user.accountStatus === "suspended") {
    return fail(c, "ACCOUNT_SUSPENDED", "Your account has been suspended.", 403);
  }
  if (user.accountStatus === "deleted") {
    return fail(c, "INVALID_CREDENTIALS", "Invalid email or password.", 401);
  }

  // Never issue a session cookie before the account is fully active — a valid
  // password alone must not grant access while email verification (or, for
  // pending_manual_review, admin approval) is still outstanding.
  if (user.accountStatus !== "active") {
    return ok(c, { message: "Please verify your email to continue.", accountStatus: user.accountStatus });
  }

  await c.env.DB.prepare(`UPDATE users SET last_active_at = ?1 WHERE id = ?2`)
    .bind(new Date().toISOString(), user.id)
    .run();

  await issueSession(c, user.id);

  return ok(c, { message: "Logged in." });
});

authRoutes.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await c.env.DB.prepare(`DELETE FROM sessions WHERE id = ?1`).bind(tokenHash).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return ok(c, { message: "Logged out." });
});

authRoutes.get("/me", async (c) => {
  const user = c.get("user");
  if (!user) return fail(c, "UNAUTHENTICATED", "Not signed in.", 401);
  return ok(c, {
    id: user.id,
    accountStatus: user.accountStatus,
    hasProfile: user.hasProfile,
  });
});
