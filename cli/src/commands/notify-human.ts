import { execSync } from "node:child_process";
import { getCurrentTmuxSession } from "../lib/session.js";

export function notifyHumanCommand(title: string, message: string): void {
  const session = getCurrentTmuxSession() ?? "unknown";
  try {
    execSync(
      `osascript -e 'display notification "[${session}] ${message}" with title "${title}" sound name "Glass"'`,
      { stdio: "ignore" }
    );
    console.log(`Notification sent: [${session}] ${title} - ${message}`);
  } catch {
    console.error("Failed to send notification (osascript not available?)");
  }
}
