import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ACADEMIC_STATUS_LABELS, GENDER_LABELS } from "@campusimi/shared";
import { api, ApiError } from "../lib/api.js";
import { fallbackAvatarDataUri } from "../lib/avatar.js";
import type { DiscoverProfile } from "../lib/types.js";

export default function Discover() {
  const navigate = useNavigate();
  const [deck, setDeck] = useState<DiscoverProfile[] | null>(null);
  const [index, setIndex] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchedWith, setMatchedWith] = useState<{ displayName: string; conversationId: string } | null>(null);

  const loadDeck = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<{ profiles: DiscoverProfile[] }>("/swipes/deck");
      setDeck(res.profiles);
      setIndex(0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }, []);

  useEffect(() => {
    loadDeck();
  }, [loadDeck]);

  const current = deck?.[index] ?? null;

  async function swipe(direction: "left" | "right") {
    if (!current || swiping) return;
    setSwiping(true);
    setError(null);
    try {
      const res = await api.post<{ matched: boolean; conversationId?: string }>("/swipes", {
        profileId: current.id,
        direction,
      });
      if (res.matched && res.conversationId) {
        setMatchedWith({ displayName: current.displayName, conversationId: res.conversationId });
      } else {
        setIndex((i) => i + 1);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSwiping(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-8">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between">
          <Link to="/matches" className="text-sm text-campus-600 hover:text-campus-800">
            ← Connections
          </Link>
          <h1 className="text-lg font-semibold text-campus-900">Discover</h1>
          <span />
        </div>

        {matchedWith && (
          <div className="mt-10 rounded-xl2 bg-white border border-campus-100 p-8 text-center">
            <p className="text-lg font-semibold text-campus-900">It's a match! 🎉</p>
            <p className="mt-2 text-sm text-campus-600">
              You and {matchedWith.displayName} both swiped right. You can chat anonymously now.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                onClick={() => navigate(`/chat/${matchedWith.conversationId}`)}
                className="px-5 py-2 rounded-full bg-campus-700 text-white font-medium hover:bg-campus-800"
              >
                Say hi
              </button>
              <button
                onClick={() => {
                  setMatchedWith(null);
                  setIndex((i) => i + 1);
                }}
                className="px-5 py-2 rounded-full border border-campus-200 text-campus-700"
              >
                Keep browsing
              </button>
            </div>
          </div>
        )}

        {!matchedWith && current && (
          <div className="mt-8">
            <div className="rounded-xl2 bg-white border border-campus-100 overflow-hidden">
              <img
                src={current.avatarUrl ?? fallbackAvatarDataUri(current.displayName)}
                alt=""
                className="w-full h-72 object-cover bg-campus-100"
              />
              <div className="p-5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-campus-900">{current.displayName}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-campus-100 text-campus-600">
                    {ACADEMIC_STATUS_LABELS[current.academicStatus as keyof typeof ACADEMIC_STATUS_LABELS] ??
                      current.academicStatus}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-campus-100 text-campus-600">
                    {GENDER_LABELS[current.gender as keyof typeof GENDER_LABELS] ?? current.gender}
                  </span>
                </div>
                <p className="mt-3 text-sm text-campus-700 whitespace-pre-wrap">
                  {current.bio || "No bio yet."}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-center gap-6">
              <button
                onClick={() => swipe("left")}
                disabled={swiping}
                className="w-16 h-16 rounded-full border border-campus-200 bg-white text-2xl text-campus-500 hover:bg-campus-100 disabled:opacity-50"
                aria-label="Pass"
              >
                ✕
              </button>
              <button
                onClick={() => swipe("right")}
                disabled={swiping}
                className="w-16 h-16 rounded-full bg-campus-700 text-2xl text-white hover:bg-campus-800 disabled:opacity-50"
                aria-label="Like"
              >
                ♥
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-campus-500">
              {deck!.length - index - 1} more in this batch
            </p>
          </div>
        )}

        {!matchedWith && !current && deck !== null && (
          <div className="mt-10 rounded-xl2 bg-white border border-campus-100 p-8 text-center text-campus-600">
            <p>No more profiles right now — check back later.</p>
            <button
              onClick={loadDeck}
              className="mt-4 px-5 py-2 rounded-full border border-campus-200 text-campus-700 hover:bg-campus-100"
            >
              Refresh
            </button>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600 text-center">{error}</p>}
      </div>
    </div>
  );
}
