-- Swipe-based discovery: a second, separate way to match besides confessions. A right
-- swipe is a private "like" of another anonymous profile; a match (and its anonymous
-- chat) is created automatically the moment both sides have swiped right on each
-- other — see lib/matching.ts createMatch, shared with the confession-based match flow.

CREATE TABLE swipes (
  id TEXT PRIMARY KEY,
  swiper_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  swiped_profile_id TEXT NOT NULL REFERENCES anonymous_profiles(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('left', 'right')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(swiper_user_id, swiped_profile_id)
);

CREATE INDEX idx_swipes_swiper ON swipes(swiper_user_id);
CREATE INDEX idx_swipes_profile_direction ON swipes(swiped_profile_id, direction);
