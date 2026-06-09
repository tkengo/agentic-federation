import { Hono } from "hono";
import { readSessionMeta } from "../lib/sessions.js";
import { listPanes } from "../lib/tmux.js";

export const panesRouter = new Hono();

/**
 * GET /api/panes/:session
 * Lists the tmux panes of the session so the client can choose a feedback target.
 */
panesRouter.get("/:session", (c) => {
  const sessionName = c.req.param("session");
  const meta = readSessionMeta(sessionName);
  if (!meta) return c.json({ error: "session not found" }, 404);

  const panes = listPanes(meta.tmux_session);
  return c.json({ session: sessionName, tmux_session: meta.tmux_session, panes });
});
