import { Link } from "react-router-dom";
import { MessageCircleHeart, ShieldCheck, Sparkles, Users } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="font-bold text-xl text-campus-800">CampusIMI</div>
        <nav className="flex gap-3">
          <Link to="/login" className="px-4 py-2 rounded-full text-campus-700 hover:bg-campus-100 transition">
            Log in
          </Link>
          <Link
            to="/register"
            className="px-4 py-2 rounded-full bg-campus-700 text-white hover:bg-campus-800 transition"
          >
            Join
          </Link>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-6 pt-12 pb-24">
        <div className="max-w-2xl">
          <span className="inline-block px-3 py-1 rounded-full bg-accent-400/20 text-accent-600 text-sm font-medium mb-4">
            For verified students only
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-campus-900 leading-tight">
            What's happening on campus?
          </h1>
          <p className="mt-4 text-lg text-campus-700">
            An anonymous feed for confessions, gossip, rants, and everything in between —
            built for one college, verified by your college email, and never tied to your
            name in front of other students.
          </p>
          <div className="mt-8 flex gap-3">
            <Link
              to="/register"
              className="px-6 py-3 rounded-full bg-campus-700 text-white font-medium hover:bg-campus-800 transition"
            >
              Create anonymous account
            </Link>
            <Link
              to="/login"
              className="px-6 py-3 rounded-full border border-campus-300 text-campus-700 font-medium hover:bg-campus-100 transition"
            >
              I already have one
            </Link>
          </div>
        </div>

        <div className="mt-20 grid sm:grid-cols-3 gap-6">
          <FeatureCard
            icon={<Sparkles className="text-accent-500" />}
            title="Anonymous, always"
            body="Post, comment, and react without your name ever showing — to other students, forever."
          />
          <FeatureCard
            icon={<ShieldCheck className="text-accent-500" />}
            title="Moderated, kept safe"
            body="Reports, rate limits, and human admins keep the community accountable behind the scenes."
          />
          <FeatureCard
            icon={<MessageCircleHeart className="text-accent-500" />}
            title="Connections, if you want them"
            body="Confessions and mutual matches are there if you're interested — never the main event."
          />
        </div>

        <div className="mt-16 flex items-center gap-2 text-sm text-campus-600">
          <Users size={16} />
          <span>Only open to holders of your college's official email domain.</span>
        </div>
      </main>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl2 bg-white p-6 shadow-sm border border-campus-100">
      <div className="mb-3">{icon}</div>
      <h3 className="font-semibold text-campus-900">{title}</h3>
      <p className="mt-1 text-sm text-campus-600">{body}</p>
    </div>
  );
}
