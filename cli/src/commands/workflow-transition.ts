import { execSync } from "node:child_process";
import { requireSessionDir } from "../lib/session.js";
import { loadSessionWorkflow } from "../lib/workflow.js";
import { completeTransition } from "../lib/engine.js";

/**
 * Resolve the current pane's ID by querying tmux for window name and pane index,
 * then matching against the workflow definition.
 */
function getCurrentPaneId(sessionDir: string): string {
  let tmuxInfo: string;
  try {
    tmuxInfo = execSync(
      'tmux display-message -t "$TMUX_PANE" -p \'#{window_name}.#{pane_index}\'',
      { encoding: "utf-8" }
    ).trim();
  } catch {
    console.error("Error: Could not query tmux. Are you running inside a tmux session?");
    process.exit(1);
  }

  const dotIdx = tmuxInfo.lastIndexOf(".");
  if (dotIdx === -1) {
    console.error(`Error: Unexpected tmux output format: ${tmuxInfo}`);
    process.exit(1);
  }
  const windowName = tmuxInfo.slice(0, dotIdx);
  const paneIndex = Number(tmuxInfo.slice(dotIdx + 1));

  const workflow = loadSessionWorkflow(sessionDir);
  if (!workflow) {
    console.error("Error: No workflow.yaml found in session directory");
    process.exit(1);
  }

  for (const win of workflow.windows) {
    if (win.name === windowName) {
      const pane = win.panes.find((p) => p.pane === paneIndex);
      if (pane) return pane.id;
    }
  }

  console.error(`Error: Could not resolve pane ID for tmux target ${tmuxInfo}`);
  process.exit(1);
}

export async function workflowTransitionCommand(result: string): Promise<void> {
  const sessionDir = requireSessionDir();
  const paneId = getCurrentPaneId(sessionDir);

  const outcome = await completeTransition(sessionDir, paneId, result);

  if (outcome.error) {
    console.error(`Error: ${outcome.error}`);
    process.exit(1);
  }

  if (outcome.transitioned) {
    console.log(`Transitioned to: ${outcome.newState}`);
    if (outcome.notifiedPanes && outcome.notifiedPanes.length > 0) {
      console.log(`Notified: ${outcome.notifiedPanes.join(", ")}`);
    }
  } else {
    console.log("Task complete. Waiting for other tasks to finish.");
  }
}
