-- Admin-gated promoted content: regular posts stay text-only (links are blocked at
-- submission time in app code — see lib/moderation.ts detectLink). Anyone who wants to
-- share an image, poster, or link — for an event, a promotion, or anything urgent —
-- submits a request here instead; an admin reviews it and, on approval, it's published
-- as a normal (but flagged) post. One unified queue handles both use cases; no payment
-- processing is involved in this version.

ALTER TABLE posts ADD COLUMN image_url TEXT;
ALTER TABLE posts ADD COLUMN link_url TEXT;
ALTER TABLE posts ADD COLUMN is_promoted INTEGER NOT NULL DEFAULT 0;

CREATE TABLE post_requests (
  id TEXT PRIMARY KEY,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anonymous_profile_id TEXT NOT NULL REFERENCES anonymous_profiles(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL DEFAULT 'promotion' CHECK (request_type IN ('promotion', 'urgent')),
  content TEXT NOT NULL,
  category TEXT CHECK (
    category IS NULL OR category IN
    ('confession', 'gossip', 'campus', 'rant', 'question', 'fun', 'crush', 'achievement', 'event', 'other')
  ),
  link_url TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  published_post_id TEXT REFERENCES posts(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_post_requests_status ON post_requests(status);
CREATE INDEX idx_post_requests_author ON post_requests(author_user_id);
CREATE INDEX idx_post_requests_created_at ON post_requests(created_at);
