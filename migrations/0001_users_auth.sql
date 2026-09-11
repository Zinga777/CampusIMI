-- Phase 1: Foundation — users, OTP verification, sessions.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  account_status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (account_status IN ('pending_verification', 'pending_manual_review', 'active', 'suspended', 'deleted')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_active_at TEXT
);

CREATE INDEX idx_users_account_status ON users(account_status);

CREATE TABLE email_otps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'verify_email' CHECK (purpose IN ('verify_email', 'password_reset')),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_email_otps_user_id ON email_otps(user_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY, -- SHA-256 hash of the opaque session token, never the raw token
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  user_agent TEXT,
  ip_hash TEXT
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
