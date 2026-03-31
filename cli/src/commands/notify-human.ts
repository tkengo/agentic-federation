import { execSync } from "node:child_process";
import { getCurrentTmuxSession } from "../lib/session.js";

export function notifyHumanCommand(title: string, message: string): void {
  sendOsNotification(title, message);
  const session = getCurrentTmuxSession() ?? "unknown";
  console.log(`Notification sent: [${session}] ${title} - ${message}`);
}

/** Send OS notification without any console output */
export function sendOsNotification(title: string, message: string): void {
  const session = getCurrentTmuxSession() ?? "unknown";
  try {
    execSync(
      `osascript -e 'display notification "[${session}] ${message}" with title "${title}" sound name "Glass"'`,
      { stdio: "ignore" }
    );
  } catch {
    // Silently ignore — osascript not available
  }
}
