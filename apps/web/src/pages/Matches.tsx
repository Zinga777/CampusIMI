import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { fallbackAvatarDataUri } from "../lib/avatar.js";

interface Match {
  id: string;
  status: string;
  createdAt: string;
  conversationId: string;
  other: { id: string; displayName: string; avatarUrl: string | null } | null;
}

export default function Matches() {
  const [matches, setMatches] = useState<Match[] | null>(null);

  useEffect(() => {
    api.get<{ matches: Match[] }>("/matches").then((res) => setMatches(res.matches));
  }, []);

  return (
    <div className="min-h-screen px-6 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <Link to="/feed" className="text-sm text-campus-600 hover:text-campus-800">
            ← Back to feed
          </Link>
          <Link
            to="/discover"
            className="px-4 py-1.5 rounded-full bg-campus-700 text-white text-sm font-medium hover:bg-campus-800"
          >
            Discover
          </Link>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-campus-900">Connections</h1>

        <div className="mt-6 space-y-3">
          {matches?.map((m) => (
            <Link
              key={m.id}
              to={`/chat/${m.conversationId}`}
              className="flex items-center gap-3 rounded-xl2 bg-white border border-campus-100 p-4 hover:border-campus-300 transition"
            >
              <img
                src={m.other?.avatarUrl ?? fallbackAvatarDataUri(m.other?.displayName ?? "?")}
                alt=""
                className="w-10 h-10 rounded-full"
              />
              <div>
                <div className="font-medium text-campus-900">{m.other?.displayName}</div>
                <div className="text-xs text-campus-500">Connected {new Date(m.createdAt).toLocaleDateString()}</div>
              </div>
            </Link>
          ))}
          {matches?.length === 0 && (
            <p className="text-center text-campus-500 py-8">
              No connections yet. Swipe right on someone in Discover, or get mutual interest on a
              confession, to unlock a chat.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
