import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { PublicAnonymousProfile } from "@campusimi/shared";
import { api } from "../lib/api.js";
import AiSuggestButton from "../components/AiSuggestButton.js";

interface Message {
  id: string;
  message: string;
  createdAt: string;
  isMine: boolean;
}

export default function Chat() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    let ws: WebSocket | null = null;

    (async () => {
      const profile = await api.get<PublicAnonymousProfile>("/profile/me");
      if (cancelled) return;

      const history = await api.get<{ messages: Message[] }>(`/conversations/${conversationId}/messages`);
      if (cancelled) return;
      setMessages(history.messages);

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${window.location.host}/api/v1/conversations/${conversationId}/ws`);
      wsRef.current = ws;

      ws.addEventListener("open", () => setConnected(true));
      ws.addEventListener("close", () => setConnected(false));
      ws.addEventListener("message", (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "message") {
          setError(null);
          setMessages((prev) => [
            ...prev,
            {
              id: data.id,
              message: data.message,
              createdAt: data.createdAt,
              isMine: data.senderProfileId === profile.id,
            },
          ]);
        } else if (data.type === "error") {
          setError(data.message ?? "Something went wrong.");
        }
      });
    })();

    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send() {
    if (!draft.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ message: draft }));
    setDraft("");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="max-w-2xl mx-auto w-full px-6 py-4 flex items-center justify-between">
        <Link to="/matches" className="text-sm text-campus-600 hover:text-campus-800">
          ← Connections
        </Link>
        <span className={`text-xs ${connected ? "text-green-600" : "text-campus-400"}`}>
          {connected ? "Connected" : "Connecting…"}
        </span>
      </header>

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
            onClick={send}
            className="px-5 rounded-full bg-campus-700 text-white font-medium hover:bg-campus-800"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
