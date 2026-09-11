-- Phase 2: Anonymous identity. Table created here (Phase 1's auth middleware already
-- joins against it to detect onboarding completion); profile creation/editing endpoints
-- ship in Phase 2.

CREATE TABLE anonymous_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  bio TEXT,
  academic_status TEXT NOT NULL CHECK (academic_status IN ('junior', 'senior')),
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'non_binary', 'prefer_not_to_say')),
  course TEXT,
  interests TEXT NOT NULL DEFAULT '[]', -- JSON array
  is_discoverable INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_anonymous_profiles_user_id ON anonymous_profiles(user_id);
