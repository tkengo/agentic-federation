import fs from "node:fs";

const LOCK_TIMEOUT_MS = 10_000;
const LOCK_RETRY_INTERVAL_MS = 50;

/**
 * Acquire a directory-based lock for the given file path.
 * Creates a .lock directory as the lock mechanism (mkdir is atomic).
 * Returns a release function that removes the lock.
 */
export async function acquireLock(filePath: string): Promise<() => void> {
  const lockDir = `${filePath}.lock`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      fs.mkdirSync(lockDir);
      // Lock acquired successfully
      return () => {
        try {
          fs.rmdirSync(lockDir);
        } catch {
          // Ignore errors during cleanup
        }
      };
    } catch {
      // Lock directory exists - another process holds the lock
      await new Promise((r) => setTimeout(r, LOCK_RETRY_INTERVAL_MS));
    }
  }

  // Timeout: try to clean up stale lock (older than timeout)
  try {
    const stat = fs.statSync(lockDir);
    if (Date.now() - stat.mtimeMs > LOCK_TIMEOUT_MS) {
      fs.rmdirSync(lockDir);
      // Retry once after stale lock cleanup
      fs.mkdirSync(lockDir);
      return () => {
        try {
          fs.rmdirSync(lockDir);
        } catch {
          // Ignore
        }
      };
    }
  } catch {
    // Ignore
  }

  throw new Error(`Failed to acquire lock for ${filePath} within ${LOCK_TIMEOUT_MS}ms`);
}
