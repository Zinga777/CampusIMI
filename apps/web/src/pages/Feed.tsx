import { useCallback, useEffect, useState } from "react";
import type { PublicAnonymousProfile } from "@campusimi/shared";
import { useAuth } from "../lib/auth-context.js";
import { useConfig } from "../lib/config-context.js";
import { api } from "../lib/api.js";
import { fallbackAvatarDataUri } from "../lib/avatar.js";
import type { FeedMode, Post } from "../lib/types.js";
import PostComposer from "../components/PostComposer.js";
import PostCard from "../components/PostCard.js";

const MODES: { value: FeedMode; label: string; emoji: string }[] = [
  { value: "trending", label: "Trending", emoji: "🔥" },
  { value: "latest", label: "Latest", emoji: "🆕" },
  { value: "discussed", label: "Discussed", emoji: "💬" },
  { value: "popular", label: "Popular", emoji: "❤️" },
];

export default function Feed() {
  const { logout } = useAuth();
  const config = useConfig();
  const [profile, setProfile] = useState<PublicAnonymousProfile | null>(null);
  const [mode, setMode] = useState<FeedMode>("trending");
  const [category, setCategory] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<PublicAnonymousProfile>("/profile/me").then(setProfile).catch(() => setProfile(null));
  }, []);

  const loadPage = useCallback(
    async (offset: number, replace: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ mode, offset: String(offset) });
        if (category) params.set("category", category);
        const res = await api.get<{ posts: Post[]; nextOffset: number | null }>(`/posts?${params}`);
        setPosts((prev) => (replace ? res.posts : [...prev, ...res.posts]));
        setNextOffset(res.nextOffset);
      } finally {
        setLoading(false);
      }
    },
    [mode, category],
  );

  useEffect(() => {
    loadPage(0, true);
  }, [loadPage]);

  return (
    <div className="min-h-screen">
      <header className="max-w-2xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="font-bold text-xl text-campus-800">CampusIMI</div>
        {profile && (
          <div className="flex items-center gap-3">
            <img
              src={profile.avatarUrl ?? fallbackAvatarDataUri(profile.displayName)}
              alt=""
              className="w-8 h-8 rounded-full"
            />
            <span className="text-sm font-medium text-campus-800">{profile.displayName}</span>
            <button onClick={() => logout()} className="text-sm text-campus-600 hover:text-campus-800">
              Log out
            </button>
          </div>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-6 pb-24">
        <PostComposer onPosted={() => loadPage(0, true)} />

        <div className="flex items-center gap-2 mb-4 overflow-x-auto">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition ${
                mode === m.value
                  ? "bg-campus-700 text-white"
                  : "bg-white border border-campus-200 text-campus-700 hover:bg-campus-100"
              }`}
            >
              {m.emoji} {m.label}
            </button>
          ))}
          {config && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="shrink-0 ml-auto rounded-full border border-campus-200 px-3 py-1.5 text-sm text-campus-700"
            >
              <option value="">All categories</option>
              {config.postCategories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {posts.length === 0 && !loading && (
            <div className="rounded-xl2 bg-white border border-campus-100 p-8 text-center text-campus-600">
              Nothing here yet — be the first to post.
            </div>
          )}
        </div>

        {nextOffset !== null && (
          <div className="mt-6 text-center">
            <button
              onClick={() => loadPage(nextOffset, false)}
              disabled={loading}
              className="px-5 py-2 rounded-full border border-campus-200 text-campus-700 hover:bg-campus-100 transition disabled:opacity-50"
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
