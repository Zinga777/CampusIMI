import { Hono } from "hono";
import { cors } from "hono/cors";
import { ApiException, fail } from "./lib/response.js";
import { resolveSession } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { configRoutes } from "./routes/config.js";
import { profileRoutes } from "./routes/profile.js";
import { mediaRoutes } from "./routes/media.js";
import type { Env, Variables } from "./types.js";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use(
  "*",
  cors({
    origin: (origin) => origin ?? "*",
    credentials: true,
  }),
);

app.get("/api/v1/health", (c) => c.json({ success: true, data: { status: "ok" } }));

app.use("/api/v1/*", resolveSession);

app.route("/api/v1/config", configRoutes);
app.route("/api/v1/auth", authRoutes);
app.route("/api/v1/profile", profileRoutes);
app.route("/api/v1/media", mediaRoutes);

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
