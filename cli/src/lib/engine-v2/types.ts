// Engine v2 type definitions
// Completely separate from v1 types (../types.ts)

// ---------------------------------------------------------------------------
// Workflow YAML schema
// ---------------------------------------------------------------------------

/** Pane definition for the human tmux window */
export interface V2Pane {
  id: string;
  command: string | null;
}

/** Human window definition */
export interface V2Window {
  panes: V2Pane[];
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

  // Control flow
  break?: boolean; // Exit parent loop
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
}

/** Top-level v2 workflow document */
export interface V2Workflow {
  name: string;
  description?: string;
  window?: V2Window;
  steps: V2Step[];
}

// ---------------------------------------------------------------------------
// Engine state (state-v2.json)
// ---------------------------------------------------------------------------

export type V2Status = "running" | "waiting_human" | "completed" | "failed";

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
  history: V2HistoryEntry[];
}
