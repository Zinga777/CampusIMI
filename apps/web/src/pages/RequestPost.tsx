import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useConfig } from "../lib/config-context.js";
import { api, ApiError } from "../lib/api.js";
import type { PostRequest } from "../lib/types.js";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

async function uploadImage(requestId: string, file: File): Promise<void> {
  const res = await fetch(`/api/v1/post-requests/${requestId}/image`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": file.type },
    body: file,
  });
  const json = await res.json();
  if (!json.success) throw new ApiError(json.error.code, json.error.message);
}

export default function RequestPost() {
  const config = useConfig();
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [requestType, setRequestType] = useState<"promotion" | "urgent">("promotion");
  const [image, setImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [requests, setRequests] = useState<PostRequest[]>([]);

  async function loadMine() {
    try {
      const res = await api.get<{ requests: PostRequest[] }>("/post-requests/mine");
      setRequests(res.requests);
    } catch {
      // non-fatal — the form itself still works
    }
  }

  useEffect(() => {
    loadMine();
  }, []);

  function onImagePicked(file: File | null) {
    setImageError(null);
    if (!file) {
      setImage(null);
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setImageError("Image must be a PNG, JPEG, or WebP file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Images must be 5MB or smaller.");
      return;
    }
    setImage(file);
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ id: string }>("/post-requests", {
        content,
        category: category || undefined,
        linkUrl: linkUrl || undefined,
        requestType,
      });
      if (image) {
        await uploadImage(res.id, image);
      }
      setContent("");
      setCategory("");
      setLinkUrl("");
      setImage(null);
      setSubmitted(true);
      loadMine();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!config) return null;

  return (
    <div className="min-h-screen">
      <header className="max-w-2xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link to="/feed" className="text-sm text-campus-600 hover:text-campus-800">
          ← Feed
        </Link>
        <div className="font-bold text-lg text-campus-800">Request a post</div>
      </header>

      <main className="max-w-2xl mx-auto px-6 pb-24">
        <p className="text-sm text-campus-600 mb-6">
          Everyone can post plain text directly to the feed. To share a link, a poster/image, or
          something urgent, submit a request here — an admin reviews it before it's published.
          There's no payment involved.
        </p>

        <div className="rounded-xl2 bg-white border border-campus-100 p-5 mb-8">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={config.limits.maxPostLength}
            rows={3}
            placeholder="Describe what you'd like posted…"
            className="w-full rounded-lg border border-campus-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-campus-400 resize-none"
          />

          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="Link (optional) — https://…"
            className="mt-3 w-full rounded-lg border border-campus-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-campus-400"
          />

          <div className="mt-3">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => onImagePicked(e.target.files?.[0] ?? null)}
              className="text-sm text-campus-700"
            />
            {imageError && <p className="mt-1 text-xs text-red-600">{imageError}</p>}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
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

            <select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as "promotion" | "urgent")}
              className="rounded-lg border border-campus-200 px-3 py-2 text-sm text-campus-700"
            >
              <option value="promotion">Event / promotion</option>
              <option value="urgent">Urgent</option>
            </select>

            <button
              onClick={submit}
              disabled={submitting || content.trim().length === 0}
              className="ml-auto px-5 py-2 rounded-full bg-campus-700 text-white font-medium hover:bg-campus-800 transition disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit for review"}
            </button>
          </div>

          {submitted && <p className="mt-3 text-sm text-green-700">Submitted — an admin will review it soon.</p>}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        <h2 className="text-sm font-semibold text-campus-800 mb-3">Your requests</h2>
        <div className="space-y-3">
          {requests.length === 0 && <p className="text-sm text-campus-500">No requests yet.</p>}
          {requests.map((r) => (
            <div key={r.id} className="rounded-xl2 bg-white border border-campus-100 p-4">
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    r.status === "approved"
                      ? "bg-green-100 text-green-700"
                      : r.status === "rejected"
                        ? "bg-red-100 text-red-700"
                        : "bg-campus-100 text-campus-600"
                  }`}
                >
                  {r.status}
                </span>
                <span className="text-xs text-campus-500">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-2 text-sm text-campus-900 whitespace-pre-wrap">{r.content}</p>
              {r.linkUrl && <p className="mt-1 text-xs text-campus-600 break-all">{r.linkUrl}</p>}
              {r.imageUrl && <img src={r.imageUrl} alt="" className="mt-2 rounded-lg max-h-48" />}
              {r.adminNote && <p className="mt-2 text-xs text-red-600">Admin note: {r.adminNote}</p>}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
