import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <Link to="/" className="block text-center font-bold text-xl text-campus-800 mb-6">
          CampusIMI
        </Link>
        <div className="rounded-xl2 bg-white shadow-sm border border-campus-100 p-8">
          <h1 className="text-xl font-semibold text-campus-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-campus-600">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
