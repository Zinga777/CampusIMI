-- Phase 5: Confessions — send/respond, mutual-interest detection, notifications.

CREATE TABLE confessions (
  id TEXT PRIMARY KEY,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_profile_id TEXT NOT NULL REFERENCES anonymous_profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_confessions_sender ON confessions(sender_user_id);
CREATE INDEX idx_confessions_recipient ON confessions(recipient_profile_id);

CREATE TABLE confession_responses (
  id TEXT PRIMARY KEY,
  confession_id TEXT NOT NULL UNIQUE REFERENCES confessions(id) ON DELETE CASCADE,
  responder_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (response IN ('interested', 'sweet', 'not_interested')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload TEXT, -- JSON
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
