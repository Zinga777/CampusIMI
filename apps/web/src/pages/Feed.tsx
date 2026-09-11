import { useAuth } from "../lib/auth-context.js";

export default function Feed() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="font-bold text-xl text-campus-800">CampusIMI</div>
        <button onClick={() => logout()} className="text-sm text-campus-600 hover:text-campus-800">
          Log out
        </button>
      </header>
      <main className="max-w-3xl mx-auto px-6 pb-24">
        <div className="rounded-xl2 bg-white border border-campus-100 p-6">
          <p className="text-campus-700">
            You're verified and signed in{user ? ` (status: ${user.accountStatus})` : ""}. The campus feed
            ships in the next phase of the build.
          </p>
        </div>
      </main>
    </div>
  );
}
