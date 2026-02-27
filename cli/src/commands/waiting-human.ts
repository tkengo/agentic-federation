import fs from "node:fs";
import path from "node:path";
import { getCurrentTmuxSession, resolveSession, requireSessionDir } from "../lib/session.js";
import { notifyHumanCommand } from "./notify-human.js";

interface WaitingHumanJson {
  waiting: boolean;
  reason: string | null;
  ts: string;
}

export function waitingHumanSetCommand(reason: string, notify: boolean): void {
  const sessionDir = requireSessionDir();
  const filePath = path.join(sessionDir, "waiting_human.json");
  const data: WaitingHumanJson = {
    waiting: true,
    reason,
    ts: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
  console.log(`Set waiting_human: ${reason}`);

  if (notify) {
    notifyHumanCommand("WAITING", reason);
  }
}

export function waitingHumanClearCommand(): void {
  // Silently exit 0 if not in a fed session (for hook safety)
  const tmuxSession = getCurrentTmuxSession();
  if (!tmuxSession) {
    return;
  }
  const sessionDir = resolveSession(tmuxSession);
  if (!sessionDir) {
    return;
  }

  const filePath = path.join(sessionDir, "waiting_human.json");
  const data: WaitingHumanJson = {
    waiting: false,
    reason: null,
    ts: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
  console.log("Cleared waiting_human.");
}

export function waitingHumanShowCommand(): void {
  const sessionDir = requireSessionDir();
  const filePath = path.join(sessionDir, "waiting_human.json");

  if (!fs.existsSync(filePath)) {
    console.log(JSON.stringify({ waiting: false }, null, 2));
    return;
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as WaitingHumanJson;
  console.log(JSON.stringify(data, null, 2));
}
