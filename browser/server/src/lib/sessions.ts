import fs from "node:fs";
import path from "node:path";
import { ACTIVE_DIR } from "./paths.js";

export interface MetaJson {
  repo: string;
  branch: string;
  workflow: string;
  worktree: string;
  tmux_session: string;
  session_dir: string;
  created_at: string;
  from?: string;
}

export interface SessionSummary {
  name: string;
  session_dir: string;
  worktree: string;
  repo: string;
  branch: string;
  workflow: string;
  created_at: string;
  description?: string;
}

function readDescription(sessionDir: string): string | undefined {
  try {
    const content = fs.readFileSync(path.join(sessionDir, "description.txt"), "utf8").trim();
    return content || undefined;
  } catch {
    return undefined;
  }
}

export function listSessions(): SessionSummary[] {
  if (!fs.existsSync(ACTIVE_DIR)) return [];

  const entries = fs.readdirSync(ACTIVE_DIR, { withFileTypes: true });
  const result: SessionSummary[] = [];

  for (const entry of entries) {
    const linkPath = path.join(ACTIVE_DIR, entry.name);
    let realDir: string;
    try {
      realDir = fs.realpathSync(linkPath);
    } catch {
      continue;
    }

    const metaPath = path.join(realDir, "meta.json");
    if (!fs.existsSync(metaPath)) continue;

    try {
      const raw = fs.readFileSync(metaPath, "utf8");
      const meta = JSON.parse(raw) as MetaJson;
      result.push({
        name: entry.name,
        session_dir: meta.session_dir,
        worktree: meta.worktree,
        repo: meta.repo,
        branch: meta.branch,
        workflow: meta.workflow,
        created_at: meta.created_at,
        description: readDescription(realDir),
      });
    } catch {
      // Skip malformed meta.json
    }
  }

  result.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return result;
}

export function readSessionMeta(sessionName: string): MetaJson | null {
  const linkPath = path.join(ACTIVE_DIR, sessionName);
  if (!fs.existsSync(linkPath)) return null;

  let realDir: string;
  try {
    realDir = fs.realpathSync(linkPath);
  } catch {
    return null;
  }

  const metaPath = path.join(realDir, "meta.json");
  if (!fs.existsSync(metaPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8")) as MetaJson;
  } catch {
    return null;
  }
}
