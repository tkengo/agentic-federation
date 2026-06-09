import type { PaneInfo } from "../api.ts";

// Agent panes set their tmux title to `✳ __fed-<workflow>-<session>-<role>`,
// so the role (e.g. "planner", "code-reviewer-history") can be recovered by
// stripping everything up to and including the session name. Non-agent panes
// (shells, editors) keep a hostname title and return null.
export function paneRole(p: PaneInfo, session: string): string | null {
  const marker = `${session}-`;
  const idx = p.title.indexOf(marker);
  if (idx < 0) return null;
  const role = p.title.slice(idx + marker.length).trim();
  return role || null;
}

// What to show as the pane's secondary descriptor: its agent role if it is an
// agent pane, otherwise the foreground command.
export function paneDescriptor(p: PaneInfo, session: string): string {
  return paneRole(p, session) ?? p.command;
}

export function paneLabel(p: PaneInfo, session: string): string {
  return `${p.windowName} · ${paneDescriptor(p, session)}`;
}

// Pick a sensible default pane: prefer the planner (the plan is what the user
// is reviewing), else any plan-window pane, else any agent pane, else the
// active/first pane. The user can always override — per design we surface the
// choice rather than auto-resolving the target.
export function pickDefault(panes: PaneInfo[], session: string): string | null {
  if (panes.length === 0) return null;
  const planner = panes.find((p) => paneRole(p, session) === "planner");
  if (planner) return planner.id;
  const planWindow = panes.find((p) => p.windowName === "plan");
  if (planWindow) return planWindow.id;
  const agent = panes.find((p) => paneRole(p, session) !== null);
  if (agent) return agent.id;
  return (panes.find((p) => p.active) ?? panes[0]).id;
}
