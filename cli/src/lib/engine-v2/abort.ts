import fs from "node:fs";
import path from "node:path";
import type { V2AbortRequest } from "./types.js";

const ABORT_REQUEST_FILE = "abort-request.json";

function abortRequestPath(sessionDir: string): string {
  return path.join(sessionDir, ABORT_REQUEST_FILE);
}

/**
 * Write an abort request file for the engine to pick up.
 */
export function writeAbortRequest(sessionDir: string, mode: "immediate" | "graceful"): void {
  const request: V2AbortRequest = {
    mode,
    requested_at: new Date().toISOString(),
  };
  fs.writeFileSync(abortRequestPath(sessionDir), JSON.stringify(request, null, 2) + "\n");
}

/**
 * Read the abort request file if it exists.
 */
export function readAbortRequest(sessionDir: string): V2AbortRequest | null {
  const fp = abortRequestPath(sessionDir);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8")) as V2AbortRequest;
  } catch {
    return null;
  }
}

/**
 * Read and delete the abort request file (one-time consumption).
 */
export function consumeAbortRequest(sessionDir: string): V2AbortRequest | null {
  const req = readAbortRequest(sessionDir);
  if (req) {
    clearAbortRequest(sessionDir);
  }
  return req;
}

/**
 * Delete the abort request file.
 */
export function clearAbortRequest(sessionDir: string): void {
  const fp = abortRequestPath(sessionDir);
  if (fs.existsSync(fp)) {
    fs.unlinkSync(fp);
  }
}
