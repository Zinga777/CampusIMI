import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api.js";
import { useAuth } from "../lib/auth-context.js";
import AuthLayout from "../components/AuthLayout.js";

export default function VerifyOtp() {
  const location = useLocation();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const state = (location.state ?? {}) as { email?: string; devOtp?: string };
  const [email, setEmail] = useState(state.email ?? "");
  const [code, setCode] = useState(state.devOtp ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/auth/verify-otp", { email, code });
      await refresh();
      navigate("/onboarding");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Verify your email" subtitle="Enter the 6-digit code we sent to your college email.">
      {state.devOtp && (
        <p className="mb-4 text-xs rounded-lg bg-accent-400/20 text-accent-600 px-3 py-2">
          Dev mode: no email provider is configured yet, so your code is pre-filled ({state.devOtp}).
        </p>
      )}
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
          <label className="block text-sm font-medium text-campus-700 mb-1">Verification code</label>
          <input
            type="text"
            required
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-lg border border-campus-200 px-4 py-2.5 tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-campus-400"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-campus-700 text-white font-medium py-2.5 hover:bg-campus-800 transition disabled:opacity-60"
        >
          {submitting ? "Verifying…" : "Verify"}
        </button>
      </form>
    </AuthLayout>
  );
}
