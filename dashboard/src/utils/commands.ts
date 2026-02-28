export interface PaletteCommand {
  id: string;
  name: string;
  description: string;
  requiresSession: boolean;
  needsConfirmation: boolean;
  resultType: "action" | "output" | "screen-transition";
}

export const PALETTE_COMMANDS: PaletteCommand[] = [
  // Session commands (require selected session)
  {
    id: "attach",
    name: "attach",
    description: "Switch to session tmux",
    requiresSession: true,
    needsConfirmation: false,
    resultType: "action",
  },
  {
    id: "approve",
    name: "approve",
    description: "Send /start_orchestrator to session",
    requiresSession: true,
    needsConfirmation: false,
    resultType: "action",
  },
  {
    id: "feedback",
    name: "feedback",
    description: "Send feedback to session",
    requiresSession: true,
    needsConfirmation: false,
    resultType: "screen-transition",
  },
  {
    id: "stop",
    name: "stop",
    description: "Stop session (fed stop)",
    requiresSession: true,
    needsConfirmation: true,
    resultType: "action",
  },
  {
    id: "info",
    name: "info",
    description: "Show session info (fed info)",
    requiresSession: true,
    needsConfirmation: false,
    resultType: "output",
  },
  {
    id: "artifacts",
    name: "artifacts",
    description: "List session artifacts (fed artifact list)",
    requiresSession: true,
    needsConfirmation: false,
    resultType: "output",
  },
  {
    id: "state",
    name: "state",
    description: "Show session state (fed state read)",
    requiresSession: true,
    needsConfirmation: false,
    resultType: "output",
  },
  {
    id: "archive",
    name: "archive",
    description: "Archive session (fed archive)",
    requiresSession: true,
    needsConfirmation: true,
    resultType: "action",
  },
  // Global commands
  {
    id: "new",
    name: "new",
    description: "Create a new session",
    requiresSession: false,
    needsConfirmation: false,
    resultType: "screen-transition",
  },
  {
    id: "clean",
    name: "clean",
    description: "Clean stale worktrees (fed clean)",
    requiresSession: false,
    needsConfirmation: true,
    resultType: "action",
  },
  {
    id: "archive-completed",
    name: "archive-completed",
    description: "Archive all completed sessions",
    requiresSession: false,
    needsConfirmation: true,
    resultType: "action",
  },
];

export function filterCommands(
  query: string,
  hasSession: boolean,
): PaletteCommand[] {
  const q = query.toLowerCase();
  return PALETTE_COMMANDS.filter((cmd) => {
    if (cmd.requiresSession && !hasSession) return false;
    if (!q) return true;
    return (
      cmd.name.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q)
    );
  });
}
