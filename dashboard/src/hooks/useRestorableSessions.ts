import { useState, useCallback } from "react";
import fs from "node:fs";
import path from "node:path";
import { ACTIVE_DIR } from "../utils/types.js";
import type { MetaJson, StateJson, RestorableSessionData } from "../utils/types.js";
import { formatAge } from "../utils/format.js";
import { listTmuxSessions } from "../utils/tmux.js";

function loadRestorableSessions(): RestorableSessionData[] {
  if (!fs.existsSync(ACTIVE_DIR)) return [];

  // Single tmux call to get all alive sessions
  const aliveSessions = listTmuxSessions();

  const entries = fs.readdirSync(ACTIVE_DIR);
  const results: RestorableSessionData[] = [];

  for (const entry of entries) {
    // Only include dead tmux sessions (O(1) Set lookup)
    if (aliveSessions.has(entry)) continue;

    const linkPath = path.join(ACTIVE_DIR, entry);
    let sessionDir: string;
    try {
      sessionDir = fs.realpathSync(linkPath);
      if (!fs.existsSync(sessionDir)) continue;
    } catch {
      continue;
    }

    // Require meta.json and workflow.yaml
    let meta: MetaJson;
    try {
      meta = JSON.parse(fs.readFileSync(path.join(sessionDir, "meta.json"), "utf-8")) as MetaJson;
    } catch {
      continue;
    }
    if (!fs.existsSync(path.join(sessionDir, "workflow.yaml"))) continue;

    // Read status
    let status = "unknown";
    try {
      const state = JSON.parse(
        fs.readFileSync(path.join(sessionDir, "state.json"), "utf-8")
      ) as StateJson;
      status = state.status || "unknown";
    } catch {
      // ignore
    }

    results.push({
      name: entry,
      sessionDir,
      meta,
      status,
      workflow: meta.workflow,
      age: formatAge(meta.created_at),
    });
  }

  return results;
}

export function useRestorableSessions() {
  const [sessions, setSessions] = useState<RestorableSessionData[]>(() => loadRestorableSessions());

  const refresh = useCallback(() => {
    setSessions(loadRestorableSessions());
  }, []);

  return { restorableSessions: sessions, refreshRestorable: refresh };
}
