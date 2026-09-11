import { useState } from "react";
import { api, ApiError } from "../lib/api.js";

export default function ConfessionDialog({
  recipientDisplayName,
  recipientAnonymousProfileId,
  onClose,
}: {
  recipientDisplayName: string;
  recipientAnonymousProfileId: string;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/confessions", { recipientAnonymousProfileId, message });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-6 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl2 p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        {sent ? (
          <div className="text-center">
            <p className="text-campus-800 font-medium">Sent anonymously to {recipientDisplayName}.</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 rounded-full bg-campus-700 text-white text-sm">
              Close
            </button>
          </div>
        ) : (
          <>
            <h2 className="font-semibold text-campus-900">Send an anonymous confession</h2>
            <p className="mt-1 text-sm text-campus-600">To {recipientDisplayName}. They won't know it's from you.</p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Say what's on your mind…"
              className="mt-3 w-full rounded-lg border border-campus-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-campus-400"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded-full text-sm text-campus-600 hover:bg-campus-100">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting || !message.trim()}
                className="px-4 py-2 rounded-full bg-campus-700 text-white text-sm font-medium hover:bg-campus-800 disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
