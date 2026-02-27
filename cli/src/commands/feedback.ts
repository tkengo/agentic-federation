import fs from "node:fs";
import path from "node:path";
import { requireSessionDir } from "../lib/session.js";

const FEEDBACK_FILE = "human_feedback.md";

export function feedbackReadCommand(): void {
  const sessionDir = requireSessionDir();
  const filePath = path.join(sessionDir, FEEDBACK_FILE);

  if (!fs.existsSync(filePath)) {
    console.error("Error: No human feedback found.");
    process.exit(1);
  }

  process.stdout.write(fs.readFileSync(filePath, "utf-8"));
}

export function feedbackWriteCommand(): void {
  const sessionDir = requireSessionDir();
  const filePath = path.join(sessionDir, FEEDBACK_FILE);

  // Read all content from stdin
  const content = fs.readFileSync("/dev/stdin", "utf-8");

  // Append with timestamp header
  const header = `\n---\n_${new Date().toISOString()}_\n\n`;
  fs.appendFileSync(filePath, header + content);

  console.error(`Feedback appended (${content.length} bytes)`);
}
