import { useState, useCallback } from "react";
import fs from "node:fs";
import path from "node:path";
import { ACTIVE_DIR } from "../utils/types.js";
import type { MetaJson, StateJson, SessionData } from "../utils/types.js";

function readMeta(sessionDir: string): MetaJson | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(sessionDir, "meta.json"), "utf-8")
    ) as MetaJson;
  } catch {
    return null;
  }
}

function readState(sessionDir: string): StateJson | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(sessionDir, "state.json"), "utf-8")
    ) as StateJson;
  } catch {
    return null;
  }
}

function resolveSession(name: string): string | null {
  const linkPath = path.join(ACTIVE_DIR, name);
  try {
    const realPath = fs.realpathSync(linkPath);
    if (fs.existsSync(realPath)) return realPath;
  } catch {
    // Broken symlink
  }
  return null;
}

function loadSessions(): SessionData[] {
  if (!fs.existsSync(ACTIVE_DIR)) return [];

  const entries = fs.readdirSync(ACTIVE_DIR);
  const sessions: SessionData[] = [];

  for (const entry of entries) {
    const sessionDir = resolveSession(entry);
    if (!sessionDir) continue;

    const meta = readMeta(sessionDir);
    if (!meta) continue;

    const state = readState(sessionDir);

    sessions.push({
      name: entry,
      sessionDir,
      meta,
      status: state?.status ?? "active",
      pendingReviews: state?.pending_reviews ?? [],
      escalation: state?.escalation ?? { required: false, reason: null },
    });
  }

  return sessions;
}

export function useSessions() {
  const [sessions, setSessions] = useState<SessionData[]>(() => loadSessions());

  const refresh = useCallback(() => {
    setSessions(loadSessions());
  }, []);

  return { sessions, refresh };
}
