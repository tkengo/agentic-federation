import type { V2Workflow } from "./types.js";

/**
 * Resolve an agent ID to its tmux pane target string ("session:window.pane").
 *
 * In engine-v3, each agent lives in a dedicated tmux pane that holds a
 * long-running CLI process (yoloclaude / yolocodex). The pane is identified
 * by matching `step.agent` against `windows[].panes[].id` in the workflow.
 *
 * This pairing is by convention: pane.id and the agent identifier used in
 * `steps[].agent` must match.
 */
export function resolveAgentPane(
  workflow: V2Workflow,
  tmuxSession: string,
  agentId: string,
): string {
  for (const win of workflow.windows ?? []) {
    const pane = win.panes.find((p) => p.id === agentId);
    if (pane) {
      return `${tmuxSession}:${win.name}.${pane.pane}`;
    }
  }
  throw new Error(
    `engine-v3: agent "${agentId}" has no matching pane. ` +
    `Define a pane with id="${agentId}" in one of the workflow's windows.`
  );
}
