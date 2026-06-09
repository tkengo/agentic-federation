import { Hono } from "hono";
import { readSessionMeta } from "../lib/sessions.js";
import { resolveGitLink } from "../lib/git.js";

export const gitRouter = new Hono();

/**
 * GET /api/git-link/:session[?path=<repo-relative path>]
 * With path: the open PR's diff for that file, else the file on its branch.
 * Without path: the PR page if one exists, else the branch's tree page.
 * { kind: "none" } for standalone sessions or repos without a resolvable remote.
 */
gitRouter.get("/:session", (c) => {
  const relPath = c.req.query("path") ?? "";

  const meta = readSessionMeta(c.req.param("session"));
  if (!meta) return c.json({ error: "session not found" }, 404);

  // Standalone sessions have no worktree (no associated repo).
  if (!meta.worktree) return c.json({ kind: "none" });

  return c.json(resolveGitLink(meta.worktree, meta.branch, relPath));
});
