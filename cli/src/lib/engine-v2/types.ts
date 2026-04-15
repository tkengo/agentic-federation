// Engine v2 type definitions

// ---------------------------------------------------------------------------
// Workflow YAML schema
// ---------------------------------------------------------------------------

/** Pane definition within a tmux window */
export interface V2Pane {
  id: string;
  name: string;
  pane: number;
  command: string | null;
}

/** Layout split definition */
export interface V2LayoutSplit {
  source: number;
  direction: "h" | "v";
  percent: number;
}

/** Window definition */
export interface V2Window {
  name: string;
  panes: V2Pane[];
  layout: {
    splits: V2LayoutSplit[];
    focus: number;
  };
}

/** Step result declaration (valid values for respond) */
export interface V2ResultDeclaration {
  values: string[];
}

/** A single step in the workflow */
export interface V2Step {
  id?: string;
  type: "claude" | "codex" | "shell" | "human" | "loop" | "branch" | "parallel";
  agent?: string;
  description?: string;
  prompt?: string;
  result?: V2ResultDeclaration;

  // Loop fields
  max?: number;
  until?: string; // ${{ expr }} condition
  steps?: V2Step[]; // Sub-steps for loop/branch-case

  // Branch fields
  cases?: V2BranchCase[];

  // Parallel fields
  branches?: V2ParallelBranch[];

  // Notification control
  notify?: boolean; // Suppress OS notification for human steps (default: true)

  // Control flow
  break?: boolean; // Exit parent loop

  // Resume fields
  resume?: boolean;        // Enable session resume on loop re-execution
  resume_prompt?: string;  // Custom prompt for resumed sessions (default: auto-generated)
}

/** A case in a branch step */
export interface V2BranchCase {
  if?: string; // ${{ expr }} condition (omit for else)
  else?: boolean; // Explicit else marker
  steps: V2Step[];
  break?: boolean; // Exit parent loop when this case is selected
}

/** A branch in a parallel step */
export interface V2ParallelBranch {
  id: string;
  type: "claude" | "codex" | "shell" | "human";
  agent?: string;
  description?: string;
  prompt?: string;
  result?: V2ResultDeclaration;
  notify?: boolean; // Suppress OS notification for human steps (default: true)
  resume?: boolean;
  resume_prompt?: string;
}

/** Top-level v2 workflow document */
export interface V2Workflow {
  name: string;
  description?: string;
  engine?: boolean; // Set to false to skip engine window/process (default: true)
  focus?: string;
  windows?: V2Window[];
  steps: V2Step[];
}

// ---------------------------------------------------------------------------
// Engine state (state-v2.json)
// ---------------------------------------------------------------------------

export type V2Status = "running" | "waiting_human" | "waiting_network" | "completed" | "failed" | "aborted";

export interface V2AbortRequest {
  mode: "immediate" | "graceful";
  requested_at: string; // ISO 8601
}

export interface V2StepResult {
  value: string;
  completed_at: string;
}

export interface V2HistoryEntry {
  ts: string;
  event: string;
  step: string;
  detail?: string;
}

export interface V2State {
  current_step: string | null;
  status: V2Status;
  results: Record<string, V2StepResult>;
  sessions: Record<string, string>;  // stepPath -> agent session ID (Claude session_id / Codex thread_id)
  loops: Record<string, { iteration: number }>;  // loop stepPath -> current iteration (for resume)
  history: V2HistoryEntry[];
}
