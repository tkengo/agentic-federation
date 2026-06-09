import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import { readSessionMeta, type MetaJson } from "../lib/sessions.js";
import { resolveWithinRoot } from "../lib/fstree.js";
import {
  readDraft,
  writeDraft,
  postDraft,
  listDrafts,
  formatFeedback,
  type CommentDraft,
  type LineComment,
} from "../lib/comments.js";
import { listPanes, sendPrompt } from "../lib/tmux.js";

export const commentsRouter = new Hono();

function isKind(k: unknown): k is "session" | "repo" {
  return k === "session" || k === "repo";
}

// Resolve the visible root for a kind, mirroring routes/file.ts.
function rootFor(kind: "session" | "repo", meta: MetaJson): string {
  return kind === "session" ? path.join(meta.session_dir, "artifacts") : meta.worktree || meta.session_dir;
}

// Read the target file's lines so submitted comments can include source context.
function readFileLines(kind: "session" | "repo", meta: MetaJson, relPath: string): string[] | undefined {
  const resolved = resolveWithinRoot(rootFor(kind, meta), relPath);
  if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return undefined;
  try {
    return fs.readFileSync(resolved, "utf8").split("\n");
  } catch {
    return undefined;
  }
}

/**
 * GET /api/comments/:session?kind=session|repo&path=<relative path>
 * With kind+path: returns the draft comments for that file.
 * Without them: returns a summary of all drafts in the session.
 */
commentsRouter.get("/:session", (c) => {
  const kind = c.req.query("kind");
  const relPath = c.req.query("path");

  const meta = readSessionMeta(c.req.param("session"));
  if (!meta) return c.json({ error: "session not found" }, 404);

  // No file specified: return a summary of every draft.
  if (!relPath && !kind) {
    const drafts = listDrafts(meta.session_dir).map((d) => ({
      kind: d.kind,
      path: d.path,
      count: d.comments.length,
    }));
    return c.json({ drafts });
  }

  if (!isKind(kind)) return c.json({ error: "kind must be 'session' or 'repo'" }, 400);
  if (!relPath) return c.json({ error: "path is required" }, 400);

  return c.json(readDraft(meta.session_dir, kind, relPath));
});

/**
 * PUT /api/comments/:session
 * Body: { kind, path, comments: LineComment[] }
 * Replaces the whole draft for that file. Sending an empty list clears it.
 */
commentsRouter.put("/:session", async (c) => {
  const meta = readSessionMeta(c.req.param("session"));
  if (!meta) return c.json({ error: "session not found" }, 404);

  let body: { kind?: unknown; path?: unknown; comments?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  if (!isKind(body.kind)) return c.json({ error: "kind must be 'session' or 'repo'" }, 400);
  if (typeof body.path !== "string" || !body.path) return c.json({ error: "path is required" }, 400);

  // Normalize and validate each comment; silently drop malformed entries.
  const clean: LineComment[] = [];
  const raw = Array.isArray(body.comments) ? body.comments : [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const line = Number(rec.line);
    const text = typeof rec.text === "string" ? rec.text : "";
    if (!Number.isInteger(line) || line < 1) continue;
    if (!text.trim()) continue;
    clean.push({
      id: typeof rec.id === "string" && rec.id ? rec.id : `${line}-${clean.length}`,
      line,
      text,
      created_at: typeof rec.created_at === "string" ? rec.created_at : new Date().toISOString(),
    });
  }

  const draft: CommentDraft = { kind: body.kind, path: body.path, comments: clean };
  writeDraft(meta.session_dir, draft);
  return c.json(draft);
});

/**
 * POST /api/comments/:session/submit-all
 * Body: { target, message? }
 * Sends an optional free-form message plus every draft (one section per file)
 * to the target pane as a single message, then renames each draft to a
 * `.<yyyymmddhhmmss>.posted.json`. At least one of message/comments is required.
 */
commentsRouter.post("/:session/submit-all", async (c) => {
  const meta = readSessionMeta(c.req.param("session"));
  if (!meta) return c.json({ error: "session not found" }, 404);

  let body: { target?: unknown; message?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const target = typeof body.target === "string" ? body.target : "";
  if (!target) return c.json({ error: "target (pane id) is required" }, 400);
  const message = typeof body.message === "string" ? body.message : "";

  const drafts = listDrafts(meta.session_dir);
  if (drafts.length === 0 && !message.trim()) {
    return c.json({ error: "nothing to submit (no comments and no message)" }, 400);
  }

  // Only allow sending to a pane that belongs to this session.
  if (!listPanes(meta.tmux_session).some((p) => p.id === target)) {
    return c.json({ error: "target pane not found in session" }, 404);
  }

  const linesByKey = new Map<string, string[]>();
  for (const d of drafts) {
    const lines = readFileLines(d.kind, meta, d.path);
    if (lines) linesByKey.set(`${d.kind}:${d.path}`, lines);
  }

  try {
    await sendPrompt(target, formatFeedback(message, drafts, linesByKey));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  const when = new Date();
  for (const d of drafts) postDraft(meta.session_dir, d.kind, d.path, when);
  const count = drafts.reduce((n, d) => n + d.comments.length, 0);
  return c.json({ ok: true, files: drafts.length, count });
});
