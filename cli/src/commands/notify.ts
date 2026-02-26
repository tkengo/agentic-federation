import fs from "node:fs";
import path from "node:path";
import { requireSessionDir, readMeta } from "../lib/session.js";

export function notifyCommand(pane: string, message: string): void {
  const sessionDir = requireSessionDir();
  const meta = readMeta(sessionDir);
  if (!meta) {
    console.error("Error: Could not read session meta.json.");
    process.exit(1);
  }

  // Resolve full pane target: <tmux_session>:agent-team.<pane>
  const target = pane.includes(":")
    ? pane
    : `${meta.tmux_session}:agent-team.${pane}`;

  // Write notification file
  const notifyDir = path.join(sessionDir, "notifications");
  fs.mkdirSync(notifyDir, { recursive: true });

  const ts = Date.now();
  const notifyFile = path.join(notifyDir, `${ts}.notify`);
  fs.writeFileSync(notifyFile, `${target}\n${message}\n`);

  console.log(`Notification queued for ${target}`);
}
