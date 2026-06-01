import { Hono } from "hono";
import { listSessions, readSessionMeta } from "../lib/sessions.js";

export const sessionsRouter = new Hono();

sessionsRouter.get("/", (c) => {
  return c.json({ sessions: listSessions() });
});

sessionsRouter.get("/:name", (c) => {
  const name = c.req.param("name");
  const meta = readSessionMeta(name);
  if (!meta) return c.json({ error: "session not found" }, 404);
  return c.json({ name, meta });
});
