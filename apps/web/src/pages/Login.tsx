import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api.js";
import { useAuth } from "../lib/auth-context.js";
import AuthLayout from "../components/AuthLayout.js";

export default function Login() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ message: string; accountStatus?: string }>("/auth/login", { email, password });
      await refresh();
      if (res.accountStatus && res.accountStatus !== "active") {
        navigate("/verify", { state: { email } });
      } else {
        navigate("/feed");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Log in with your college email.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-campus-700 mb-1">College email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-campus-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-campus-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-campus-700 mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-campus-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-campus-400"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-campus-700 text-white font-medium py-2.5 hover:bg-campus-800 transition disabled:opacity-60"
        >
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-center text-campus-600">
        New here?{" "}
        <Link to="/register" className="text-campus-700 font-medium">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
