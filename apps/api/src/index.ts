import { Hono } from "hono";
import { cors } from "hono/cors";
import { ApiException, fail } from "./lib/response.js";
import { resolveSession } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { configRoutes } from "./routes/config.js";
import { profileRoutes } from "./routes/profile.js";
import { mediaRoutes } from "./routes/media.js";
import { postRoutes } from "./routes/posts.js";
import { commentRoutes } from "./routes/comments.js";
import { blockRoutes } from "./routes/blocks.js";
import { reportRoutes } from "./routes/reports.js";
import { adminRoutes } from "./routes/admin.js";
import { confessionRoutes } from "./routes/confessions.js";
import { notificationRoutes } from "./routes/notifications.js";
import { matchRoutes } from "./routes/matches.js";
import { conversationRoutes } from "./routes/conversations.js";
import { aiRoutes } from "./routes/ai.js";
import { eventRoutes } from "./routes/events.js";
import type { Env, Variables } from "./types.js";

export { ChatRoom } from "./durable-objects/ChatRoom.js";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use(
  "*",
  cors({
    // Reflecting an arbitrary request origin while allowing credentials would let
    // any website make cookie-authenticated requests to this API on a victim's
    // behalf. Only ever echo back an origin that's on the configured allowlist.
    origin: (origin, c) => {
      const allowed = ((c.env.ALLOWED_ORIGINS as string | undefined) ?? "")
        .split(",")
        .map((o: string) => o.trim())
        .filter(Boolean);
      return allowed.includes(origin) ? origin : null;
    },
    credentials: true,
  }),
);

app.get("/api/v1/health", (c) => c.json({ success: true, data: { status: "ok" } }));

app.use("/api/v1/*", resolveSession);

app.route("/api/v1/config", configRoutes);
app.route("/api/v1/auth", authRoutes);
app.route("/api/v1/profile", profileRoutes);
app.route("/api/v1/media", mediaRoutes);
app.route("/api/v1/posts", postRoutes);
app.route("/api/v1/comments", commentRoutes);
app.route("/api/v1/blocks", blockRoutes);
app.route("/api/v1/reports", reportRoutes);
app.route("/api/v1/admin", adminRoutes);
app.route("/api/v1/confessions", confessionRoutes);
app.route("/api/v1/notifications", notificationRoutes);
app.route("/api/v1/matches", matchRoutes);
app.route("/api/v1/conversations", conversationRoutes);
app.route("/api/v1/ai", aiRoutes);
app.route("/api/v1/events", eventRoutes);

app.notFound((c) => fail(c, "NOT_FOUND", "Not found.", 404));

app.onError((err, c) => {
  if (err instanceof ApiException) {
    return fail(c, err.code, err.message, err.status as 400);
  }
  // Never leak stack traces / internal details to clients.
  console.error(err);
  return fail(c, "INTERNAL_ERROR", "Something went wrong. Please try again.", 500);
});

export default app;
