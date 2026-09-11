import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api.js";
import AuthLayout from "../components/AuthLayout.js";

export default function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ message: string; devOtp?: string }>("/auth/register", { email, password });
      navigate("/verify", { state: { email, devOtp: res.devOtp } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Use your college email — you'll stay anonymous to everyone else.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-campus-700 mb-1">College email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@college.edu"
            className="w-full rounded-lg border border-campus-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-campus-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-campus-700 mb-1">Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full rounded-lg border border-campus-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-campus-400"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-campus-700 text-white font-medium py-2.5 hover:bg-campus-800 transition disabled:opacity-60"
        >
          {submitting ? "Sending code…" : "Send verification code"}
        </button>
      </form>
      <p className="mt-4 text-sm text-center text-campus-600">
        Already verified?{" "}
        <Link to="/login" className="text-campus-700 font-medium">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
