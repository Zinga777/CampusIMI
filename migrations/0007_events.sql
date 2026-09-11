-- Phase 8: Campus events.

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anonymous_profile_id TEXT NOT NULL REFERENCES anonymous_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  starts_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'removed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_events_starts_at ON events(starts_at);
CREATE INDEX idx_events_status ON events(status);

CREATE TABLE event_participants (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(event_id, user_id)
);

CREATE INDEX idx_event_participants_event_id ON event_participants(event_id);
