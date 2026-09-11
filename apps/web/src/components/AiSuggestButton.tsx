import { useState } from "react";
import { Sparkles } from "lucide-react";
import { api, ApiError } from "../lib/api.js";

export default function AiSuggestButton({
  label,
  endpoint,
  body,
  onPick,
}: {
  label: string;
  endpoint: string;
  body?: unknown;
  onPick: (suggestion: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchSuggestions() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ suggestions: string[] }>(endpoint, body);
      setSuggestions(res.suggestions);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "AI suggestions unavailable right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={fetchSuggestions}
        className="flex items-center gap-1 text-xs font-medium text-campus-600 hover:text-campus-800"
      >
        <Sparkles size={14} /> {label}
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-72 bg-white border border-campus-100 rounded-lg shadow-lg p-2">
          <div className="flex items-center justify-between mb-1 px-1">
            <span className="text-xs font-medium text-campus-500">AI suggestions — pick one, then edit as you like</span>
            <button onClick={() => setOpen(false)} className="text-campus-400 hover:text-campus-600 text-xs">
              ✕
            </button>
          </div>
          {loading && <p className="px-2 py-2 text-sm text-campus-500">Thinking…</p>}
          {error && <p className="px-2 py-2 text-sm text-red-600">{error}</p>}
          {suggestions?.map((s, i) => (
            <button
              key={i}
              onClick={() => {
                onPick(s);
                setOpen(false);
              }}
              className="w-full text-left px-2 py-2 rounded-md hover:bg-campus-50 text-sm text-campus-800"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
