import { useState } from "react";
import { useConfig } from "../lib/config-context.js";
import { api, ApiError } from "../lib/api.js";

export default function PostComposer({ onPosted }: { onPosted: () => void }) {
  const config = useConfig();
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(confirmWarning = false) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ id?: string; needsConfirmation?: boolean; warning?: string }>("/posts", {
        content,
        category: category || undefined,
        confirmWarning,
      });
      if (res.needsConfirmation) {
        setWarning(res.warning ?? null);
        return;
      }
      setContent("");
      setCategory("");
      setWarning(null);
      onPosted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!config) return null;

  return (
    <div className="rounded-xl2 bg-white border border-campus-100 p-5 mb-6">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={config.limits.maxPostLength}
        rows={3}
        placeholder="What's happening on campus? Post anonymously…"
        className="w-full rounded-lg border border-campus-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-campus-400 resize-none"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-campus-200 px-3 py-2 text-sm text-campus-700"
        >
          <option value="">No category</option>
          {config.postCategories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => submit(false)}
          disabled={submitting || content.trim().length === 0}
          className="px-5 py-2 rounded-full bg-campus-700 text-white font-medium hover:bg-campus-800 transition disabled:opacity-50"
        >
          {submitting ? "Posting…" : "Post anonymously"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {warning && (
        <div className="mt-3 rounded-lg bg-accent-400/15 border border-accent-400/30 px-4 py-3 text-sm text-campus-800">
          <p>{warning}</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => submit(true)}
              className="px-3 py-1.5 rounded-full bg-campus-700 text-white text-xs font-medium"
            >
              Post anyway
            </button>
            <button
              onClick={() => setWarning(null)}
              className="px-3 py-1.5 rounded-full border border-campus-200 text-xs font-medium text-campus-700"
            >
              Edit post
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
