import { useState } from "react";
import { useConfig } from "../lib/config-context.js";
import { api, ApiError } from "../lib/api.js";

const REASON_LABELS: Record<string, string> = {
  harassment: "Harassment",
  bullying: "Bullying",
  threat: "Threat",
  spam: "Spam",
  fake_account: "Fake account",
  impersonation: "Impersonation",
  private_information: "Private information",
  sexual_content: "Sexual / inappropriate content",
  hate_abuse: "Hate / abuse",
  false_accusation: "False accusation / rumour",
  other: "Other",
};

export default function ReportDialog({
  contentType,
  contentId,
  onClose,
}: {
  contentType: "post" | "comment";
  contentId: string;
  onClose: () => void;
}) {
  const config = useConfig();
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!reason) {
      setError("Please select a reason.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/reports", { contentType, contentId, reason, description: description.trim() || undefined });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-6 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl2 p-6 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {submitted ? (
          <div className="text-center">
            <p className="text-campus-800 font-medium">Thanks — our admins will review this.</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 rounded-full bg-campus-700 text-white text-sm">
              Close
            </button>
          </div>
        ) : (
          <>
            <h2 className="font-semibold text-campus-900">Report this {contentType}</h2>
            <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
              {(config?.reportReasons ?? Object.keys(REASON_LABELS)).map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm text-campus-700">
                  <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
                  {REASON_LABELS[r] ?? r}
                </label>
              ))}
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional details (optional)"
              rows={2}
              className="mt-3 w-full rounded-lg border border-campus-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-campus-400"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded-full text-sm text-campus-600 hover:bg-campus-100">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="px-4 py-2 rounded-full bg-campus-700 text-white text-sm font-medium hover:bg-campus-800 disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Submit report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
