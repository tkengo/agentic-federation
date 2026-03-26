import { requireSessionDir } from "../lib/session.js";
import { forceGoto } from "../lib/engine.js";

export async function workflowGotoCommand(targetState: string): Promise<void> {
  const sessionDir = requireSessionDir();

  const result = await forceGoto(sessionDir, targetState);

  if (result.error) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }

  if (result.success) {
    console.log(`Force-transitioned: ${result.previousState} -> ${result.newState}`);
    if (result.notifiedPanes && result.notifiedPanes.length > 0) {
      console.log(`Dispatched tasks to: ${result.notifiedPanes.join(", ")}`);
    }
  }
}
