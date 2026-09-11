import { useState } from "react";
import { Heart, MessageCircle } from "lucide-react";
import type { Post, Comment } from "../lib/types.js";
import { api, ApiError } from "../lib/api.js";
import { fallbackAvatarDataUri } from "../lib/avatar.js";
import { POST_CATEGORY_LABELS } from "@campusimi/shared";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function PostCard({ post: initial }: { post: Post }) {
  const [post, setPost] = useState(initial);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentWarning, setCommentWarning] = useState<string | null>(null);

  async function toggleLike() {
    const wasLiked = post.viewerHasLiked;
    setPost((p) => ({
      ...p,
      viewerHasLiked: !wasLiked,
      likeCount: p.likeCount + (wasLiked ? -1 : 1),
    }));
    try {
      if (wasLiked) {
        await api.delete(`/posts/${post.id}/like`);
      } else {
        await api.post(`/posts/${post.id}/like`);
      }
    } catch {
      setPost((p) => ({
        ...p,
        viewerHasLiked: wasLiked,
        likeCount: p.likeCount + (wasLiked ? 1 : -1),
      }));
    }
  }

  async function loadComments() {
    setShowComments((v) => !v);
    if (comments === null) {
      const res = await api.get<{ comments: Comment[] }>(`/posts/${post.id}/comments`);
      setComments(res.comments);
    }
  }

  async function submitComment(confirmWarning = false) {
    if (!commentDraft.trim()) return;
    try {
      const res = await api.post<{ id?: string; needsConfirmation?: boolean; warning?: string }>(
        `/posts/${post.id}/comments`,
        { content: commentDraft, confirmWarning },
      );
      if (res.needsConfirmation) {
        setCommentWarning(res.warning ?? null);
        return;
      }
      setCommentDraft("");
      setCommentWarning(null);
      setPost((p) => ({ ...p, commentCount: p.commentCount + 1 }));
      const refreshed = await api.get<{ comments: Comment[] }>(`/posts/${post.id}/comments`);
      setComments(refreshed.comments);
    } catch (err) {
      if (err instanceof ApiError) setCommentWarning(err.message);
    }
  }

  return (
    <div className="rounded-xl2 bg-white border border-campus-100 p-5">
      <div className="flex items-center gap-3">
        <img
          src={post.author.avatarUrl ?? fallbackAvatarDataUri(post.author.displayName)}
          alt=""
          className="w-9 h-9 rounded-full"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-campus-900 text-sm">{post.author.displayName}</span>
            {post.category && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-campus-100 text-campus-600">
                {POST_CATEGORY_LABELS[post.category as keyof typeof POST_CATEGORY_LABELS] ?? post.category}
              </span>
            )}
          </div>
          <span className="text-xs text-campus-500">{timeAgo(post.createdAt)}</span>
        </div>
      </div>

      <p className="mt-3 text-campus-900 whitespace-pre-wrap">{post.content}</p>

      <div className="mt-4 flex items-center gap-5 text-sm text-campus-600">
        <button
          onClick={toggleLike}
          className={`flex items-center gap-1.5 hover:text-red-600 transition ${
            post.viewerHasLiked ? "text-red-600" : ""
          }`}
        >
          <Heart size={16} fill={post.viewerHasLiked ? "currentColor" : "none"} />
          {post.likeCount}
        </button>
        <button onClick={loadComments} className="flex items-center gap-1.5 hover:text-campus-800 transition">
          <MessageCircle size={16} />
          {post.commentCount}
        </button>
      </div>

      {showComments && (
        <div className="mt-4 border-t border-campus-100 pt-4 space-y-3">
          {comments === null && <p className="text-sm text-campus-500">Loading…</p>}
          {comments?.map((cm) => (
            <div key={cm.id} className="flex gap-2">
              <img
                src={cm.author.avatarUrl ?? fallbackAvatarDataUri(cm.author.displayName)}
                alt=""
                className="w-6 h-6 rounded-full"
              />
              <div className="flex-1 bg-campus-50 rounded-lg px-3 py-2">
                <div className="text-xs font-medium text-campus-800">{cm.author.displayName}</div>
                <div className="text-sm text-campus-900">{cm.content}</div>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitComment(false)}
              placeholder="Add a comment…"
              className="flex-1 rounded-lg border border-campus-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-campus-400"
            />
            <button
              onClick={() => submitComment(false)}
              className="px-4 rounded-lg bg-campus-700 text-white text-sm font-medium hover:bg-campus-800"
            >
              Reply
            </button>
          </div>
          {commentWarning && (
            <div className="rounded-lg bg-accent-400/15 border border-accent-400/30 px-3 py-2 text-xs text-campus-800">
              <p>{commentWarning}</p>
              <button
                onClick={() => submitComment(true)}
                className="mt-1 px-3 py-1 rounded-full bg-campus-700 text-white text-xs font-medium"
              >
                Post anyway
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
