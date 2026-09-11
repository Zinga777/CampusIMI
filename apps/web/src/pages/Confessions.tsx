import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";

interface ReceivedConfession {
  id: string;
  message: string;
  createdAt: string;
  response: string | null;
}

interface SentConfession {
  id: string;
  message: string;
  createdAt: string;
  recipientDisplayName: string;
  response: string | null;
}

const RESPONSE_LABELS: Record<string, string> = {
  interested: "I'm interested 💛",
  sweet: "That's sweet 🙂",
  not_interested: "Not interested",
};

export default function Confessions() {
  const [tab, setTab] = useState<"received" | "sent">("received");
  const [received, setReceived] = useState<ReceivedConfession[] | null>(null);
  const [sent, setSent] = useState<SentConfession[] | null>(null);
  const [mutualBanner, setMutualBanner] = useState(false);

  async function loadReceived() {
    const res = await api.get<{ confessions: ReceivedConfession[] }>("/confessions/received");
    setReceived(res.confessions);
  }
  async function loadSent() {
    const res = await api.get<{ confessions: SentConfession[] }>("/confessions/sent");
    setSent(res.confessions);
  }

  useEffect(() => {
    loadReceived();
    loadSent();
  }, []);

  async function respond(id: string, response: string) {
    const res = await api.post<{ mutualInterest?: boolean }>(`/confessions/${id}/respond`, { response });
    if (res.mutualInterest) setMutualBanner(true);
    await loadReceived();
  }

  return (
    <div className="min-h-screen px-6 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/feed" className="text-sm text-campus-600 hover:text-campus-800">
          ← Back to feed
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-campus-900">Confessions</h1>

        {mutualBanner && (
          <div className="mt-4 rounded-xl2 bg-accent-400/15 border border-accent-400/30 px-5 py-4 text-campus-900">
            🎉 You and someone else are mutually interested! Full anonymous chat &amp; connections ship in the
            next phase of the build.
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button
            onClick={() => setTab("received")}
            className={`px-4 py-1.5 rounded-full text-sm font-medium ${
              tab === "received" ? "bg-campus-700 text-white" : "bg-white border border-campus-200 text-campus-700"
            }`}
          >
            Received
          </button>
          <button
            onClick={() => setTab("sent")}
            className={`px-4 py-1.5 rounded-full text-sm font-medium ${
              tab === "sent" ? "bg-campus-700 text-white" : "bg-white border border-campus-200 text-campus-700"
            }`}
          >
            Sent
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {tab === "received" &&
            received?.map((cf) => (
              <div key={cf.id} className="rounded-xl2 bg-white border border-campus-100 p-5">
                <p className="text-campus-900">{cf.message}</p>
                <p className="mt-1 text-xs text-campus-500">Someone anonymous</p>
                {cf.response ? (
                  <p className="mt-3 text-sm text-campus-600">
                    You responded: <strong>{RESPONSE_LABELS[cf.response] ?? cf.response}</strong>
                  </p>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => respond(cf.id, "interested")}
                      className="px-3 py-1.5 rounded-full bg-campus-700 text-white text-xs font-medium"
                    >
                      I'm interested
                    </button>
                    <button
                      onClick={() => respond(cf.id, "sweet")}
                      className="px-3 py-1.5 rounded-full border border-campus-200 text-campus-700 text-xs font-medium"
                    >
                      That's sweet
                    </button>
                    <button
                      onClick={() => respond(cf.id, "not_interested")}
                      className="px-3 py-1.5 rounded-full border border-campus-200 text-campus-500 text-xs font-medium"
                    >
                      Not interested
                    </button>
                  </div>
                )}
              </div>
            ))}
          {tab === "received" && received?.length === 0 && (
            <p className="text-center text-campus-500 py-8">No confessions yet.</p>
          )}

          {tab === "sent" &&
            sent?.map((cf) => (
              <div key={cf.id} className="rounded-xl2 bg-white border border-campus-100 p-5">
                <p className="text-campus-900">{cf.message}</p>
                <p className="mt-1 text-xs text-campus-500">To {cf.recipientDisplayName}</p>
                <p className="mt-2 text-sm text-campus-600">
                  {cf.response ? (
                    <>
                      They responded: <strong>{RESPONSE_LABELS[cf.response] ?? cf.response}</strong>
                    </>
                  ) : (
                    "Waiting for a response…"
                  )}
                </p>
              </div>
            ))}
          {tab === "sent" && sent?.length === 0 && <p className="text-center text-campus-500 py-8">Nothing sent yet.</p>}
        </div>
      </div>
    </div>
  );
}
