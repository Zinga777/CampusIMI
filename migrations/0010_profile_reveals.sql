-- Mutual profile reveals: after a match (via swipe or confession), both people start
-- fully anonymous to each other beyond avatar + bio. Either side can opt in to reveal
-- one of their own hidden fields (gender, academic status, course, interests); it only
-- becomes visible to both once BOTH have opted in for that field -- same mutual-consent
-- shape as the confession "mutual interest" check, applied per field instead of once.

CREATE TABLE profile_reveals (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK (field IN ('gender', 'academicStatus', 'course', 'interests')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(match_id, user_id, field)
);

CREATE INDEX idx_profile_reveals_match ON profile_reveals(match_id);
