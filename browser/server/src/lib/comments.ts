import fs from "node:fs";
import path from "node:path";

// A single comment anchored to a 1-based line of a file.
export interface LineComment {
  id: string;
  line: number;
  text: string;
  created_at: string;
}

// All draft comments for one file (kind + relative path).
export interface CommentDraft {
  kind: "session" | "repo";
  path: string;
  comments: LineComment[];
}

const FEEDBACK_DIR = "feedback";

function feedbackDir(sessionDir: string): string {
  return path.join(sessionDir, FEEDBACK_DIR);
}

// Build a safe, flat draft filename from kind + relative path. Slashes and
// parent-dir segments are neutralized so the file always lands directly in the
// feedback directory regardless of the original path depth.
function draftFileName(kind: string, relPath: string): string {
  const safe = relPath.replace(/\.\./g, "_").replace(/[/\\]/g, "_");
  return `${kind}__${safe}.draft.json`;
}

export function readDraft(
  sessionDir: string,
  kind: "session" | "repo",
  relPath: string,
): CommentDraft {
  const file = path.join(feedbackDir(sessionDir), draftFileName(kind, relPath));
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as CommentDraft;
    return { kind, path: relPath, comments: parsed.comments ?? [] };
  } catch {
    return { kind, path: relPath, comments: [] };
  }
}

// Read every non-empty draft in the session, sorted by kind+path for stable
// display and submission order.
export function listDrafts(sessionDir: string): CommentDraft[] {
  const dir = feedbackDir(sessionDir);
  if (!fs.existsSync(dir)) return [];
  const out: CommentDraft[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".draft.json")) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as CommentDraft;
      if (
        (parsed.kind === "session" || parsed.kind === "repo") &&
        typeof parsed.path === "string" &&
        Array.isArray(parsed.comments) &&
        parsed.comments.length > 0
      ) {
        out.push({ kind: parsed.kind, path: parsed.path, comments: parsed.comments });
      }
    } catch {
      // Skip malformed draft files.
    }
  }
  out.sort((a, b) => `${a.kind}:${a.path}`.localeCompare(`${b.kind}:${b.path}`));
  return out;
}

// Persist a draft. An empty comment list removes the draft file so stale empty
// drafts do not linger.
export function writeDraft(sessionDir: string, draft: CommentDraft): void {
  const dir = feedbackDir(sessionDir);
  const file = path.join(dir, draftFileName(draft.kind, draft.path));
  if (draft.comments.length === 0) {
    if (fs.existsSync(file)) fs.rmSync(file);
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(draft, null, 2)}\n`);
}

function timestamp(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

// Rename the draft to `<base>.<yyyymmddhhmmss>.posted.json` to mark it as sent.
// Returns the posted file path, or null if there was no draft to post.
export function postDraft(
  sessionDir: string,
  kind: "session" | "repo",
  relPath: string,
  when: Date,
): string | null {
  const dir = feedbackDir(sessionDir);
  const draftFile = path.join(dir, draftFileName(kind, relPath));
  if (!fs.existsSync(draftFile)) return null;
  const base = draftFileName(kind, relPath).replace(/\.draft\.json$/, "");
  const postedFile = path.join(dir, `${base}.${timestamp(when)}.posted.json`);
  fs.renameSync(draftFile, postedFile);
  return postedFile;
}

// Format one file's comments (sorted by line). When the file's source lines are
// provided, each comment is shown alongside the line it refers to.
function formatBody(draft: CommentDraft, fileLines?: string[]): string {
  const sorted = [...draft.comments].sort((a, b) => a.line - b.line);
  return sorted
    .map((c) => {
      const src = fileLines?.[c.line - 1];
      const lineRef = src !== undefined ? `L${c.line}: ${src}` : `L${c.line}`;
      return `${lineRef}\n  ↳ ${c.text}`;
    })
    .join("\n\n");
}

// Format feedback for delivery to a pane: an optional free-form message at the
// top, followed by one section per file of line comments (GitHub review style).
// `linesByKey` maps `${kind}:${path}` to the file's source lines so comments can
// be shown with the lines they refer to.
export function formatFeedback(
  message: string,
  drafts: CommentDraft[],
  linesByKey: Map<string, string[]>,
): string {
  const blocks: string[] = [];
  const msg = message.trim();
  if (msg) blocks.push(msg);
  for (const d of drafts) {
    blocks.push(`## ${d.path}\n${formatBody(d, linesByKey.get(`${d.kind}:${d.path}`))}`);
  }
  return blocks.join("\n\n");
}
