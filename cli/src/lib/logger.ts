import fs from "node:fs";
import path from "node:path";
import { LOGS_DIR } from "./paths.js";

let logFile: string | null = null;

// Get today's log file path (using local date)
function getLogFilePath(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return path.join(LOGS_DIR, `${y}-${m}-${d}.log`);
}

// Write a line to the log file
function writeLog(line: string): void {
  if (!logFile) return;
  try {
    fs.appendFileSync(logFile, line + "\n");
  } catch {
    // Silently ignore write failures
  }
}

// Format timestamp for log entries
function timestamp(): string {
  return new Date().toISOString();
}

// Initialize logging: set up log file, monkey-patch console
export function initLogger(argv: string[]): void {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  logFile = getLogFilePath();

  const commandLabel = argv.slice(2).join(" ") || "(no args)";
  writeLog(`\n[${timestamp()}] === fed ${commandLabel} ===`);

  // Monkey-patch console.log and console.error
  const origLog = console.log;
  const origError = console.error;

  console.log = (...args: unknown[]) => {
    origLog(...args);
    const msg = args.map(String).join(" ");
    writeLog(`[${timestamp()}] [stdout] ${msg}`);
  };

  console.error = (...args: unknown[]) => {
    origError(...args);
    const msg = args.map(String).join(" ");
    writeLog(`[${timestamp()}] [stderr] ${msg}`);
  };
}

// Log a message directly to the log file (not to console)
export function log(message: string): void {
  writeLog(`[${timestamp()}] ${message}`);
}
