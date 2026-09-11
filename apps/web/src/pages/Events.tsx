import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { api, ApiError } from "../lib/api.js";

interface EventItem {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  displayName: string;
  participantCount: number;
  viewerInterested: number | boolean;
}

export default function Events() {
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const res = await api.get<{ events: EventItem[] }>("/events");
    setEvents(res.events);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleInterested(ev: EventItem) {
    const interested = Boolean(ev.viewerInterested);
    if (interested) {
      await api.delete(`/events/${ev.id}/interested`);
    } else {
      await api.post(`/events/${ev.id}/interested`);
    }
    await load();
  }

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !startsAt) {
      setError("Title and start time are required.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/events", {
        title,
        description: description || undefined,
        location: location || undefined,
        startsAt: new Date(startsAt).toISOString(),
      });
      setTitle("");
      setDescription("");
      setLocation("");
      setStartsAt("");
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/feed" className="text-sm text-campus-600 hover:text-campus-800">
          ← Back to feed
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-campus-900">Campus Events</h1>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="px-4 py-1.5 rounded-full bg-campus-700 text-white text-sm font-medium hover:bg-campus-800"
          >
            {showCreate ? "Cancel" : "+ New event"}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={createEvent} className="mt-4 rounded-xl2 bg-white border border-campus-100 p-5 space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              className="w-full rounded-lg border border-campus-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-campus-400"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full rounded-lg border border-campus-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-campus-400"
            />
            <div className="flex gap-2">
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location (optional)"
                className="flex-1 rounded-lg border border-campus-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-campus-400"
              />
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="rounded-lg border border-campus-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-campus-400"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-full bg-campus-700 text-white text-sm font-medium hover:bg-campus-800 disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create event"}
            </button>
          </form>
        )}

        <div className="mt-6 space-y-3">
          {events?.map((ev) => (
            <div key={ev.id} className="rounded-xl2 bg-white border border-campus-100 p-5">
              <h3 className="font-semibold text-campus-900">{ev.title}</h3>
              {ev.description && <p className="mt-1 text-sm text-campus-700">{ev.description}</p>}
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-campus-500">
                <span className="flex items-center gap-1">
                  <CalendarDays size={14} /> {new Date(ev.startsAt).toLocaleString()}
                </span>
                {ev.location && (
                  <span className="flex items-center gap-1">
                    <MapPin size={14} /> {ev.location}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Users size={14} /> {ev.participantCount} interested
                </span>
              </div>
              <p className="mt-2 text-xs text-campus-500">Posted by {ev.displayName}</p>
              <button
                onClick={() => toggleInterested(ev)}
                className={`mt-3 px-4 py-1.5 rounded-full text-xs font-medium ${
                  ev.viewerInterested
                    ? "bg-campus-700 text-white"
                    : "border border-campus-200 text-campus-700 hover:bg-campus-100"
                }`}
              >
                {ev.viewerInterested ? "I'm interested ✓" : "I'm interested"}
              </button>
            </div>
          ))}
          {events?.length === 0 && (
            <p className="text-center text-campus-500 py-8">No upcoming events yet — be the first to post one.</p>
          )}
        </div>
      </div>
    </div>
  );
}
