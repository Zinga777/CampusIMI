import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context.js";

export default function ProtectedRoute({
  children,
  requireProfile = false,
  requireNoProfile = false,
}: {
  children: ReactNode;
  requireProfile?: boolean;
  requireNoProfile?: boolean;
}) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user || user.accountStatus !== "active") return <Navigate to="/login" replace />;
  if (requireProfile && !user.hasProfile) return <Navigate to="/onboarding" replace />;
  if (requireNoProfile && user.hasProfile) return <Navigate to="/feed" replace />;

  return <>{children}</>;
}
