import fs from "node:fs";
import path from "node:path";
import { ACTIVE_DIR, ARCHIVE_DIR, SESSIONS_DIR } from "../lib/paths.js";
import { resolveSession, readMeta } from "../lib/session.js";
import type { StateJson } from "../lib/types.js";

// Move a single session directory to archive and remove its active symlink
function archiveSession(
  sessionDir: string,
  activeName: string | null
): boolean {
  const meta = readMeta(sessionDir);
  const repoName = meta?.repo ?? path.basename(path.dirname(sessionDir));
  const dirName = path.basename(sessionDir);
  const archiveDest = path.join(ARCHIVE_DIR, repoName, dirName);

  fs.mkdirSync(path.join(ARCHIVE_DIR, repoName), { recursive: true });

  // Remove active symlink if present
  if (activeName) {
    const linkPath = path.join(ACTIVE_DIR, activeName);
    try {
      fs.lstatSync(linkPath);
      fs.unlinkSync(linkPath);
    } catch {
      // Symlink doesn't exist
    }
  }

  // Move session to archive
  try {
    fs.renameSync(sessionDir, archiveDest);
  } catch {
    // Cross-device rename fallback
    try {
      fs.cpSync(sessionDir, archiveDest, { recursive: true });
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`  Error archiving ${dirName}: ${err}`);
      return false;
    }
  }

  const label = meta
    ? `${meta.repo}/${meta.branch}`
    : dirName;
  console.log(`  Archived: ${label}`);
  return true;
}

export function archiveCommand(sessionName: string): void {
  const sessionDir = resolveSession(sessionName);
  if (!sessionDir) {
    console.error(
      `Error: No active session found for '${sessionName}'.`
    );
    process.exit(1);
  }

  console.log(`Archiving session: ${sessionName}`);
  archiveSession(sessionDir, sessionName);
  console.log("Done.");
}

export function archiveAllCompletedCommand(): void {
  // Scan all active sessions and archive those with COMPLETED/APPROVED status
  if (!fs.existsSync(ACTIVE_DIR)) {
    console.log("No active sessions.");
    return;
  }

  const entries = fs.readdirSync(ACTIVE_DIR);
  const completedStatuses = new Set(["completed", "approved"]);
  let archived = 0;

  for (const entry of entries) {
    const sessionDir = resolveSession(entry);
    if (!sessionDir) continue;

    const statePath = path.join(sessionDir, "state.json");
    if (!fs.existsSync(statePath)) continue;

    try {
      const state = JSON.parse(
        fs.readFileSync(statePath, "utf-8")
      ) as StateJson;
      if (completedStatuses.has(state.status)) {
        if (archiveSession(sessionDir, entry)) {
          archived++;
        }
      }
    } catch {
      // Skip sessions with unreadable state
    }
  }

  // Also scan sessions/ for orphaned directories (no active symlink)
  if (fs.existsSync(SESSIONS_DIR)) {
    const repos = fs.readdirSync(SESSIONS_DIR);
    for (const repo of repos) {
      const repoDir = path.join(SESSIONS_DIR, repo);
      if (!fs.statSync(repoDir).isDirectory()) continue;

      const sessions = fs.readdirSync(repoDir);
      for (const sessionDirName of sessions) {
        const sessionDir = path.join(repoDir, sessionDirName);
        if (!fs.statSync(sessionDir).isDirectory()) continue;

        const statePath = path.join(sessionDir, "state.json");
        if (!fs.existsSync(statePath)) continue;

        try {
          const state = JSON.parse(
            fs.readFileSync(statePath, "utf-8")
          ) as StateJson;
          if (completedStatuses.has(state.status)) {
            // Check if already archived (not in sessions/ anymore after previous archiveSession)
            if (fs.existsSync(sessionDir)) {
              if (archiveSession(sessionDir, null)) {
                archived++;
              }
            }
          }
        } catch {
          // Skip
        }
      }
    }
  }

  if (archived === 0) {
    console.log("No completed sessions to archive.");
  } else {
    console.log(`Archived ${archived} session(s).`);
  }
}
