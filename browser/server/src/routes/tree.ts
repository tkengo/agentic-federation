import path from "node:path";
import { Hono } from "hono";
import { readSessionMeta } from "../lib/sessions.js";
import { buildTree } from "../lib/fstree.js";

export const treeRouter = new Hono();

/**
 * GET /api/tree/:session
 * Returns file trees for the given session: artifacts/ and the worktree (repo).
 */
treeRouter.get("/:session", (c) => {
  const sessionName = c.req.param("session");
  const meta = readSessionMeta(sessionName);
  if (!meta) return c.json({ error: "session not found" }, 404);

  const artifactsRoot = path.join(meta.session_dir, "artifacts");
  // Standalone sessions have no worktree; fall back to the session directory.
  const repoRoot = meta.worktree || meta.session_dir;

  return c.json({
    session: {
      root: artifactsRoot,
      tree: buildTree(artifactsRoot),
    },
    repo: {
      root: repoRoot,
      tree: buildTree(repoRoot),
    },
  });
});
