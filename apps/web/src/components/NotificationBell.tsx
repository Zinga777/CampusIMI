import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";

interface Notification {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

const LABELS: Record<string, string> = {
  confession_received: "You received an anonymous confession",
  confession_responded: "Someone responded to your confession",
  mutual_interest: "You have mutual interest with someone! 🎉",
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  async function connect(withProfileId: string) {
    const res = await api.post<{ conversationId: string }>("/matches", { anonymousProfileId: withProfileId });
    setOpen(false);
    navigate(`/chat/${res.conversationId}`);
  }

  async function load() {
    const res = await api.get<{ notifications: Notification[] }>("/notifications");
    setNotifications(res.notifications);
  }

  useEffect(() => {
    load();
  }, []);

  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="relative">
      <button
        onClick={async () => {
          setOpen((v) => !v);
          if (!open) await load();
        }}
        className="relative text-campus-600 hover:text-campus-800 p-1"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-accent-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-campus-100 rounded-lg shadow-lg z-20 max-h-80 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-campus-100">
            <span className="text-sm font-medium text-campus-800">Notifications</span>
            <Link to="/confessions" onClick={() => setOpen(false)} className="text-xs text-campus-600 hover:text-campus-800">
              View confessions
            </Link>
          </div>
          {notifications.length === 0 && (
            <p className="px-3 py-4 text-sm text-campus-500 text-center">No notifications yet.</p>
          )}
          {notifications.map((n) => (
            <div key={n.id} className={`px-3 py-2 text-sm border-b border-campus-50 ${n.isRead ? "text-campus-500" : "text-campus-900 font-medium"}`}>
              {LABELS[n.type] ?? n.type}
              {n.type === "mutual_interest" && typeof n.payload?.withProfileId === "string" && (
                <button
                  onClick={() => connect(n.payload!.withProfileId as string)}
                  className="ml-2 mt-1 block px-2.5 py-1 rounded-full bg-campus-700 text-white text-xs font-medium"
                >
                  Connect
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
