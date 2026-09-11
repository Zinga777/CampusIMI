import { useEffect, useState } from "react";
import type { PublicAnonymousProfile } from "@campusimi/shared";
import { useAuth } from "../lib/auth-context.js";
import { api } from "../lib/api.js";
import { fallbackAvatarDataUri } from "../lib/avatar.js";

export default function Feed() {
  const { logout } = useAuth();
  const [profile, setProfile] = useState<PublicAnonymousProfile | null>(null);

  useEffect(() => {
    api.get<PublicAnonymousProfile>("/profile/me").then(setProfile).catch(() => setProfile(null));
  }, []);

  return (
    <div className="min-h-screen">
      <header className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="font-bold text-xl text-campus-800">CampusIMI</div>
        {profile && (
          <div className="flex items-center gap-3">
            <img
              src={profile.avatarUrl ?? fallbackAvatarDataUri(profile.displayName)}
              alt=""
              className="w-8 h-8 rounded-full"
            />
            <span className="text-sm font-medium text-campus-800">{profile.displayName}</span>
            <button onClick={() => logout()} className="text-sm text-campus-600 hover:text-campus-800">
              Log out
            </button>
          </div>
        )}
      </header>
      <main className="max-w-3xl mx-auto px-6 pb-24">
        <div className="rounded-xl2 bg-white border border-campus-100 p-6">
          <p className="text-campus-700">
            You're signed in as <strong>{profile?.displayName ?? "…"}</strong>
            {profile?.academicStatus ? ` (${profile.academicStatus})` : ""}. The campus feed
            ships in the next phase of the build.
          </p>
        </div>
      </main>
    </div>
  );
}
