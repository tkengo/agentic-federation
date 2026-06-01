import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import { readSessionMeta } from "../lib/sessions.js";
import { resolveWithinRoot } from "../lib/fstree.js";

// For kind=session, the visible root is the artifacts subdirectory.
function rootFor(kind: "session" | "repo", meta: { session_dir: string; worktree: string }): string {
  return kind === "session" ? path.join(meta.session_dir, "artifacts") : meta.worktree;
}

export const fileRouter = new Hono();

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * GET /api/file/:session?kind=session|repo&path=<relative path>
 */
fileRouter.get("/:session", (c) => {
  const sessionName = c.req.param("session");
  const kind = c.req.query("kind");
  const rel = c.req.query("path") ?? "";

  if (kind !== "session" && kind !== "repo") {
    return c.json({ error: "kind must be 'session' or 'repo'" }, 400);
  }

  const meta = readSessionMeta(sessionName);
  if (!meta) return c.json({ error: "session not found" }, 404);

  const root = rootFor(kind, meta);
  const resolved = resolveWithinRoot(root, rel);
  if (!resolved) {
    return c.json({ error: "path traversal not allowed" }, 400);
  }
  if (!fs.existsSync(resolved)) {
    return c.json({ error: "file not found" }, 404);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    return c.json({ error: "not a file" }, 400);
  }
  if (stat.size > MAX_FILE_BYTES) {
    return c.json({ error: "file too large" }, 413);
  }

  const ext = path.extname(resolved).toLowerCase();
  const content = fs.readFileSync(resolved, "utf8");

  return c.json({
    path: rel,
    name: path.basename(resolved),
    ext,
    size: stat.size,
    mtime: stat.mtimeMs,
    content,
  });
});
