-- Phase 4: Moderation & safety — reports, blocks, admin users, audit log.

CREATE TABLE blocks (
  id TEXT PRIMARY KEY,
  blocker_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(blocker_user_id, blocked_user_id)
);

CREATE INDEX idx_blocks_blocker ON blocks(blocker_user_id);
CREATE INDEX idx_blocks_blocked ON blocks(blocked_user_id);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('post', 'comment', 'anonymous_profile', 'message')),
  content_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'harassment', 'bullying', 'threat', 'spam', 'fake_account', 'impersonation',
    'private_information', 'sexual_content', 'hate_abuse', 'false_accusation', 'other'
  )),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT,
  resolved_by TEXT REFERENCES users(id)
);

CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_created_at ON reports(created_at);
CREATE INDEX idx_reports_content ON reports(content_type, content_id);

CREATE TABLE admin_users (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'moderator' CHECK (role IN ('moderator', 'admin')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata TEXT, -- JSON
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_audit_logs_admin ON audit_logs(admin_user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_target ON audit_logs(target_type, target_id);

-- Lightweight per-user rate limiting counters (sliding windows implemented in app code
-- by counting rows in the relevant time bucket; this table just records actions).
CREATE TABLE rate_limit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('post', 'comment', 'like', 'confession', 'message', 'ai_request')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_rate_limit_events_lookup ON rate_limit_events(user_id, action, created_at);
