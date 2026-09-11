-- Phase 3: Campus feed — posts, likes, reactions, comments, comment likes.

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anonymous_profile_id TEXT NOT NULL REFERENCES anonymous_profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  category TEXT CHECK (
    category IS NULL OR category IN
    ('confession', 'gossip', 'campus', 'rant', 'question', 'fun', 'crush', 'achievement', 'event', 'other')
  ),
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'hidden', 'under_review', 'removed')),
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  reaction_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_posts_created_at ON posts(created_at);
CREATE INDEX idx_posts_category ON posts(category);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_author_user_id ON posts(author_user_id);

CREATE TABLE post_likes (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(post_id, user_id)
);

CREATE INDEX idx_post_likes_post_id ON post_likes(post_id);
CREATE INDEX idx_post_likes_user_id ON post_likes(user_id);

CREATE TABLE post_reactions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('haha', 'wow', 'sad', 'fire', 'clap')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(post_id, user_id)
);

CREATE INDEX idx_post_reactions_post_id ON post_reactions(post_id);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anonymous_profile_id TEXT NOT NULL REFERENCES anonymous_profiles(id) ON DELETE CASCADE,
  parent_comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'hidden', 'under_review', 'removed')),
  like_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_created_at ON comments(created_at);

CREATE TABLE comment_likes (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(comment_id, user_id)
);

CREATE INDEX idx_comment_likes_comment_id ON comment_likes(comment_id);
