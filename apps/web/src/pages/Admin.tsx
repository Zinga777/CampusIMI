import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";

interface Stats {
  totalStudents: number;
  verifiedStudents: number;
  postsToday: number;
  commentsToday: number;
  matches: number;
  totalReports: number;
  pendingReports: number;
}

interface Report {
  id: string;
  reporterUserId: string;
  contentType: string;
  contentId: string;
  reason: string;
  description: string | null;
  status: string;
  createdAt: string;
}

interface AdminPost {
  id: string;
  content: string;
  category: string | null;
  status: string;
  authorUserId: string;
  likeCount: number;
  commentCount: number;
  createdAt: string;
}

interface AdminUser {
  id: string;
  accountStatus: string;
  isVerified: number;
  createdAt: string;
  lastActiveAt: string | null;
}

interface AuditLog {
  id: string;
  adminUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: string | null;
  createdAt: string;
}

interface AdminPostRequest {
  id: string;
  content: string;
  category: string | null;
  requestType: string;
  linkUrl: string | null;
  imageUrl: string | null;
  status: string;
  adminNote: string | null;
  authorUserId: string;
  displayName: string;
  createdAt: string;
}

type Tab = "overview" | "reports" | "posts" | "requests" | "users" | "audit";

export default function Admin() {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [posts, setPosts] = useState<AdminPost[] | null>(null);
  const [postRequests, setPostRequests] = useState<AdminPostRequest[] | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[] | null>(null);

  useEffect(() => {
    api.get<Stats>("/admin/stats").then(setStats);
  }, []);

  useEffect(() => {
    if (tab === "reports") api.get<{ reports: Report[] }>("/admin/reports?status=open").then((r) => setReports(r.reports));
    if (tab === "posts") api.get<{ posts: AdminPost[] }>("/admin/posts").then((r) => setPosts(r.posts));
    if (tab === "requests")
      api
        .get<{ requests: AdminPostRequest[] }>("/admin/post-requests?status=pending")
        .then((r) => setPostRequests(r.requests));
    if (tab === "users") api.get<{ users: AdminUser[] }>("/admin/users").then((r) => setUsers(r.users));
    if (tab === "audit") api.get<{ auditLogs: AuditLog[] }>("/admin/audit-logs").then((r) => setAuditLogs(r.auditLogs));
  }, [tab]);

  async function resolveReport(id: string, outcome: "resolved" | "dismissed") {
    await api.post(`/admin/reports/${id}/resolve`, { outcome });
    setReports((prev) => prev?.filter((r) => r.id !== id) ?? null);
  }

  async function hidePost(id: string) {
    await api.post(`/admin/posts/${id}/hide`);
    setPosts((prev) => prev?.map((p) => (p.id === id ? { ...p, status: "hidden" } : p)) ?? null);
  }
  async function removePost(id: string) {
    await api.post(`/admin/posts/${id}/remove`);
    setPosts((prev) => prev?.map((p) => (p.id === id ? { ...p, status: "removed" } : p)) ?? null);
  }
  async function restorePost(id: string) {
    await api.post(`/admin/posts/${id}/restore`);
    setPosts((prev) => prev?.map((p) => (p.id === id ? { ...p, status: "published" } : p)) ?? null);
  }

  async function approveRequest(id: string) {
    await api.post(`/admin/post-requests/${id}/approve`);
    setPostRequests((prev) => prev?.filter((r) => r.id !== id) ?? null);
  }
  async function rejectRequest(id: string) {
    const note = window.prompt("Reason for rejecting (optional):") ?? undefined;
    await api.post(`/admin/post-requests/${id}/reject`, { note });
    setPostRequests((prev) => prev?.filter((r) => r.id !== id) ?? null);
  }

  async function suspendUser(id: string) {
    await api.post(`/admin/users/${id}/suspend`);
    setUsers((prev) => prev?.map((u) => (u.id === id ? { ...u, accountStatus: "suspended" } : u)) ?? null);
  }
  async function unsuspendUser(id: string) {
    await api.post(`/admin/users/${id}/unsuspend`);
    setUsers((prev) => prev?.map((u) => (u.id === id ? { ...u, accountStatus: "active" } : u)) ?? null);
  }

  return (
    <div className="min-h-screen px-6 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <Link to="/feed" className="text-sm text-campus-600 hover:text-campus-800">
              ← Back to feed
            </Link>
            <h1 className="mt-2 text-2xl font-semibold text-campus-900">Admin Dashboard</h1>
          </div>
        </div>

        <div className="mt-6 flex gap-2 overflow-x-auto">
          {(["overview", "reports", "posts", "requests", "users", "audit"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium capitalize ${
                tab === t ? "bg-campus-700 text-white" : "bg-white border border-campus-200 text-campus-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "overview" && stats && (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total students" value={stats.totalStudents} />
            <StatCard label="Verified" value={stats.verifiedStudents} />
            <StatCard label="Posts today" value={stats.postsToday} />
            <StatCard label="Comments today" value={stats.commentsToday} />
            <StatCard label="Matches" value={stats.matches} />
            <StatCard label="Total reports" value={stats.totalReports} />
            <StatCard label="Pending reports" value={stats.pendingReports} highlight={stats.pendingReports > 0} />
          </div>
        )}

        {tab === "reports" && (
          <div className="mt-6 space-y-3">
            {reports?.map((r) => (
              <div key={r.id} className="rounded-xl2 bg-white border border-campus-100 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-campus-900">
                    {r.contentType} · {r.reason}
                  </span>
                  <span className="text-xs text-campus-500">{new Date(r.createdAt).toLocaleString()}</span>
                </div>
                {r.description && <p className="mt-1 text-sm text-campus-700">{r.description}</p>}
                <p className="mt-1 text-xs text-campus-400">Content id: {r.contentId}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => resolveReport(r.id, "resolved")}
                    className="px-3 py-1.5 rounded-full bg-campus-700 text-white text-xs font-medium"
                  >
                    Mark resolved
                  </button>
                  <button
                    onClick={() => resolveReport(r.id, "dismissed")}
                    className="px-3 py-1.5 rounded-full border border-campus-200 text-xs font-medium text-campus-700"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
            {reports?.length === 0 && <p className="text-center text-campus-500 py-8">No open reports.</p>}
          </div>
        )}

        {tab === "posts" && (
          <div className="mt-6 space-y-3">
            {posts?.map((p) => (
              <div key={p.id} className="rounded-xl2 bg-white border border-campus-100 p-4">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      p.status === "published"
                        ? "bg-green-100 text-green-700"
                        : p.status === "hidden"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {p.status}
                  </span>
                  <span className="text-xs text-campus-500">{new Date(p.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-sm text-campus-900">{p.content}</p>
                <div className="mt-2 flex gap-2">
                  {p.status !== "hidden" && (
                    <button onClick={() => hidePost(p.id)} className="px-3 py-1 rounded-full border border-campus-200 text-xs">
                      Hide
                    </button>
                  )}
                  {p.status !== "removed" && (
                    <button onClick={() => removePost(p.id)} className="px-3 py-1 rounded-full border border-red-200 text-red-600 text-xs">
                      Remove
                    </button>
                  )}
                  {p.status !== "published" && (
                    <button onClick={() => restorePost(p.id)} className="px-3 py-1 rounded-full bg-campus-700 text-white text-xs">
                      Restore
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "requests" && (
          <div className="mt-6 space-y-3">
            {postRequests?.map((r) => (
              <div key={r.id} className="rounded-xl2 bg-white border border-campus-100 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-campus-100 text-campus-600 capitalize">
                    {r.requestType}
                  </span>
                  <span className="text-xs text-campus-500">{new Date(r.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-sm text-campus-900 whitespace-pre-wrap">{r.content}</p>
                {r.linkUrl && <p className="mt-1 text-xs text-campus-600 break-all">{r.linkUrl}</p>}
                {r.imageUrl && <img src={r.imageUrl} alt="" className="mt-2 rounded-lg max-h-64" />}
                <p className="mt-1 text-xs text-campus-400">From: {r.displayName}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => approveRequest(r.id)}
                    className="px-3 py-1.5 rounded-full bg-campus-700 text-white text-xs font-medium"
                  >
                    Approve & publish
                  </button>
                  <button
                    onClick={() => rejectRequest(r.id)}
                    className="px-3 py-1.5 rounded-full border border-red-200 text-red-600 text-xs font-medium"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
            {postRequests?.length === 0 && <p className="text-center text-campus-500 py-8">No pending requests.</p>}
          </div>
        )}

        {tab === "users" && (
          <div className="mt-6 space-y-2">
            {users?.map((u) => (
              <div key={u.id} className="rounded-xl2 bg-white border border-campus-100 p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-mono text-campus-700">{u.id}</p>
                  <p className="text-xs text-campus-500">
                    {u.accountStatus} · verified: {u.isVerified ? "yes" : "no"} · joined{" "}
                    {new Date(u.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {u.accountStatus === "suspended" ? (
                  <button onClick={() => unsuspendUser(u.id)} className="px-3 py-1.5 rounded-full bg-campus-700 text-white text-xs">
                    Unsuspend
                  </button>
                ) : (
                  <button onClick={() => suspendUser(u.id)} className="px-3 py-1.5 rounded-full border border-red-200 text-red-600 text-xs">
                    Suspend
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "audit" && (
          <div className="mt-6 space-y-2">
            {auditLogs?.map((log) => (
              <div key={log.id} className="rounded-xl2 bg-white border border-campus-100 p-3 text-sm">
                <span className="font-medium text-campus-900">{log.action}</span>{" "}
                <span className="text-campus-600">
                  on {log.targetType} {log.targetId}
                </span>{" "}
                <span className="text-xs text-campus-400">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl2 border p-4 ${highlight ? "bg-accent-400/10 border-accent-400/30" : "bg-white border-campus-100"}`}>
      <div className="text-2xl font-semibold text-campus-900">{value}</div>
      <div className="text-xs text-campus-500 mt-1">{label}</div>
    </div>
  );
}
