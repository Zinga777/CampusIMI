import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ACADEMIC_STATUS_LABELS, GENDER_LABELS } from "@campusimi/shared";
import { api, ApiError } from "../lib/api.js";
import AiSuggestButton from "../components/AiSuggestButton.js";

interface Message {
  id: string;
  message: string;
  createdAt: string;
  isMine: boolean;
}

type RevealField = "gender" | "interests" | "academicStatus" | "course";

interface Reveal {
  field: RevealField;
  iOptedIn: boolean;
  theyOptedIn: boolean;
  revealed: boolean;
  value: string | string[] | null;
}

const REVEAL_LABELS: Record<RevealField, string> = {
  gender: "Gender",
  interests: "Interests",
  academicStatus: "Academic status",
  course: "Course",
};

function formatRevealValue(field: RevealField, value: string | string[] | null): string {
  if (value === null) return "";
  if (field === "gender") return GENDER_LABELS[value as keyof typeof GENDER_LABELS] ?? String(value);
  if (field === "academicStatus") return ACADEMIC_STATUS_LABELS[value as keyof typeof ACADEMIC_STATUS_LABELS] ?? String(value);
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None listed";
  return String(value) || "None listed";
}

// Chat runs on plain REST + polling rather than a live WebSocket connection —
// no Cloudflare Durable Object is needed, which keeps the whole app on
// Cloudflare's free tier. Messages typically show up within this interval.
const POLL_INTERVAL_MS = 3000;

export default function Chat() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [reveals, setReveals] = useState<Reveal[] | null>(null);
  const [revealPanelOpen, setRevealPanelOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastCreatedAtRef = useRef<string | null>(null);

  const loadReveals = useCallback(async () => {
    if (!conversationId) return;
    try {
      const res = await api.get<{ reveals: Reveal[] }>(`/conversations/${conversationId}/reveals`);
      setReveals(res.reveals);
    } catch {
      // non-fatal — chat still works without the reveal panel loading
    }
  }, [conversationId]);

  useEffect(() => {
    loadReveals();
    const interval = setInterval(loadReveals, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadReveals]);

  async function optIn(field: RevealField) {
    if (!conversationId) return;
    try {
      await api.post(`/conversations/${conversationId}/reveals`, { field });
      loadReveals();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  const poll = useCallback(async () => {
    if (!conversationId) return;
    try {
      const params = new URLSearchParams();
      if (lastCreatedAtRef.current) params.set("after", lastCreatedAtRef.current);
      const res = await api.get<{ messages: Message[] }>(`/conversations/${conversationId}/messages?${params}`);
      if (res.messages.length > 0) {
        lastCreatedAtRef.current = res.messages[res.messages.length - 1]!.createdAt;
        setMessages((prev) => [...prev, ...res.messages]);
      }
    } catch {
      // transient poll failure — silently retry on the next tick
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;

    (async () => {
      const history = await api.get<{ messages: Message[] }>(`/conversations/${conversationId}/messages`);
      if (cancelled) return;
      setMessages(history.messages);
      lastCreatedAtRef.current = history.messages.at(-1)?.createdAt ?? null;
      setLoaded(true);
    })();

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [conversationId, poll]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(confirmWarning = false) {
    const text = draft.trim();
    if (!text || !conversationId || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.post<Message & { needsConfirmation?: boolean; warning?: string }>(
        `/conversations/${conversationId}/messages`,
        { message: text, confirmWarning },
      );
      if (res.needsConfirmation) {
        setWarning(res.warning ?? null);
        return;
      }
      setMessages((prev) => [...prev, res]);
      lastCreatedAtRef.current = res.createdAt;
      setDraft("");
      setWarning(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="max-w-2xl mx-auto w-full px-6 py-4 flex items-center justify-between">
        <Link to="/matches" className="text-sm text-campus-600 hover:text-campus-800">
          ← Connections
        </Link>
        <div className="flex items-center gap-3">
          {reveals && (
            <button
              onClick={() => setRevealPanelOpen((v) => !v)}
              className="text-xs px-3 py-1.5 rounded-full bg-accent-400/20 text-accent-600 font-medium hover:bg-accent-400/30"
            >
              🔓 Get to know them ({reveals.filter((r) => r.revealed).length}/{reveals.length})
            </button>
          )}
          <span className="text-xs text-campus-400">{loaded ? "Auto-refreshing" : "Loading…"}</span>
        </div>
      </header>

      {revealPanelOpen && reveals && (
        <div className="max-w-2xl mx-auto w-full px-6 pb-3">
          <div className="rounded-xl2 bg-white border border-campus-100 p-4">
            <p className="text-xs text-campus-500 mb-3">
              You're both still anonymous beyond your avatar and bio. Opt in to reveal one of your
              own details — it only shows to either of you once you <em>both</em> opt in for it.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {reveals.map((r) => (
                <div key={r.field} className="rounded-lg border border-campus-100 p-3">
                  <div className="text-xs font-medium text-campus-700">{REVEAL_LABELS[r.field]}</div>
                  {r.revealed ? (
                    <p className="mt-1 text-sm text-campus-900">{formatRevealValue(r.field, r.value)}</p>
                  ) : r.iOptedIn ? (
                    <p className="mt-1 text-xs text-campus-500">
                      Waiting on them{r.theyOptedIn ? "…" : "."}
                    </p>
                  ) : (
                    <>
                      {r.theyOptedIn && (
                        <p className="mt-1 text-xs text-accent-600">They're ready to share this!</p>
                      )}
                      <button
                        onClick={() => optIn(r.field)}
                        className="mt-1 text-xs px-2 py-1 rounded-full bg-campus-700 text-white font-medium hover:bg-campus-800"
                      >
                        Reveal mine
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 flex flex-col">
        <div className="flex-1 overflow-y-auto space-y-2 pb-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.isMine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                  m.isMine ? "bg-campus-700 text-white" : "bg-white border border-campus-100 text-campus-900"
                }`}
              >
                {m.message}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </main>

      <div className="max-w-2xl mx-auto w-full px-6 pb-6">
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {warning && (
          <div className="mb-3 rounded-lg bg-accent-400/15 border border-accent-400/30 px-4 py-3 text-sm text-campus-800">
            <p>{warning}</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => send(true)}
                className="px-3 py-1.5 rounded-full bg-campus-700 text-white text-xs font-medium"
              >
                Send anyway
              </button>
              <button
                onClick={() => setWarning(null)}
                className="px-3 py-1.5 rounded-full border border-campus-200 text-xs font-medium text-campus-700"
              >
                Edit message
              </button>
            </div>
          </div>
        )}
        <div className="flex gap-4 mb-2">
          <AiSuggestButton
            label="Conversation starter"
            endpoint="/ai/conversation-starters"
            body={{ conversationId }}
            onPick={setDraft}
          />
          <AiSuggestButton
            label="Plan something together"
            endpoint="/ai/date-plan"
            body={{ conversationId }}
            onPick={setDraft}
          />
        </div>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Type a message… still anonymous"
            className="flex-1 rounded-full border border-campus-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-campus-400"
          />
          <button
            onClick={() => send()}
            disabled={sending}
            className="px-5 rounded-full bg-campus-700 text-white font-medium hover:bg-campus-800 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
