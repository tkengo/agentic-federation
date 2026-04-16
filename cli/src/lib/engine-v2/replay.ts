import fs from "node:fs";
import path from "node:path";
import type { V2ReplayRequest } from "./types.js";

const REPLAY_REQUEST_FILE = "replay-request.json";

function replayRequestPath(sessionDir: string): string {
  return path.join(sessionDir, REPLAY_REQUEST_FILE);
}

/**
 * Write a replay request file for the engine to pick up.
 */
export function writeReplayRequest(sessionDir: string, from: string): void {
  const request: V2ReplayRequest = {
    from,
    requested_at: new Date().toISOString(),
  };
  fs.writeFileSync(replayRequestPath(sessionDir), JSON.stringify(request, null, 2) + "\n");
}

/**
 * Read the replay request file if it exists.
 */
export function readReplayRequest(sessionDir: string): V2ReplayRequest | null {
  const fp = replayRequestPath(sessionDir);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8")) as V2ReplayRequest;
  } catch {
    return null;
  }
}

/**
 * Read and delete the replay request file (one-time consumption).
 */
export function consumeReplayRequest(sessionDir: string): V2ReplayRequest | null {
  const req = readReplayRequest(sessionDir);
  if (req) {
    clearReplayRequest(sessionDir);
  }
  return req;
}

/**
 * Delete the replay request file.
 */
export function clearReplayRequest(sessionDir: string): void {
  const fp = replayRequestPath(sessionDir);
  if (fs.existsSync(fp)) {
    fs.unlinkSync(fp);
  }
}
