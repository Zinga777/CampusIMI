import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { api, ApiError } from "../lib/api.js";

export default function AdminGuard({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"loading" | "admin" | "denied">("loading");

  useEffect(() => {
    api
      .get("/admin/me")
      .then(() => setStatus("admin"))
      .catch((err) => {
        if (err instanceof ApiError) setStatus("denied");
      });
  }, []);

  if (status === "loading") return null;
  if (status === "denied") return <Navigate to="/feed" replace />;
  return <>{children}</>;
}
