import fs from "node:fs";
import path from "node:path";
import { ACTIVE_DIR, ARCHIVE_DIR } from "../lib/paths.js";
import { resolveSession, readMeta } from "../lib/session.js";

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

