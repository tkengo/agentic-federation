// Engine v3 type definitions

// ---------------------------------------------------------------------------
// Workflow YAML schema
// ---------------------------------------------------------------------------

/** Pane definition within a tmux window */
export interface WorkflowPane {
  id: string;
  name: string;
  pane: number;
  command: string | null;
}

/** Layout split definition */
export interface LayoutSplit {
  source: number;
  direction: "h" | "v";
  percent: number;
}

/** Window definition */
export interface WorkflowWindow {
  name: string;
  panes: WorkflowPane[];
  layout: {
    splits: LayoutSplit[];
    focus: number;
  };
}

/** Step result declaration (valid values for respond) */
export interface ResultDeclaration {
  values: string[];
}

/** A single step in the workflow */
export interface WorkflowStep {
  id?: string;
  type: "claude" | "codex" | "shell" | "human" | "loop" | "branch" | "parallel";
  agent?: string;
  description?: string;
  prompt?: string;
  result?: ResultDeclaration;

  // Loop fields
  max?: number;
  until?: string; // ${{ expr }} condition
  steps?: WorkflowStep[]; // Sub-steps for loop/branch-case

  // Branch fields
  cases?: BranchCase[];

  // Parallel fields
  branches?: ParallelBranch[];

  // Notification control
  notify?: boolean; // Suppress OS notification for human steps (default: true)

  // Control flow
  break?: boolean; // Exit parent loop

  // Resume fields
  resume?: boolean;        // Enable session resume on loop re-execution
  resume_prompt?: string;  // Custom prompt for resumed sessions (default: auto-generated)
}

/** A case in a branch step */
export interface BranchCase {
  if?: string; // ${{ expr }} condition (omit for else)
  else?: boolean; // Explicit else marker
  steps: WorkflowStep[];
  break?: boolean; // Exit parent loop when this case is selected
}

/** A branch in a parallel step */
export interface ParallelBranch {
  id: string;
  type: "claude" | "codex" | "shell" | "human";
  agent?: string;
  description?: string;
  prompt?: string;
  result?: ResultDeclaration;
  notify?: boolean; // Suppress OS notification for human steps (default: true)
  resume?: boolean;
  resume_prompt?: string;
}

/** Top-level workflow document */
export interface Workflow {
  name: string;
  description?: string;
  // engine field semantics:
  //   "v2"                    -> v2 engine (legacy headless `claude -p` spawning)
  //   undefined / true / "v3" -> v3 engine (tmux-resident agents, default)
  //   false                   -> no engine window/process (standalone tmux session)
  engine?: boolean | "v2" | "v3";
  focus?: string;
  windows?: WorkflowWindow[];
  steps: WorkflowStep[];
}

// ---------------------------------------------------------------------------
// Engine state (state-v2.json — file name preserved for compatibility with
// existing sessions; the schema is now used by both engine-v2 and engine-v3)
// ---------------------------------------------------------------------------

export type EngineStatus = "running" | "waiting_human" | "waiting_network" | "completed" | "failed" | "aborted";

export interface AbortRequest {
  mode: "immediate" | "graceful";
  requested_at: string; // ISO 8601
}

export interface ReplayRequest {
  from: string; // step path to replay from
  requested_at: string; // ISO 8601
}

export interface StepResult {
  value: string;
  completed_at: string;
}

export interface HistoryEntry {
  ts: string;
  event: string;
  step: string;
  detail?: string;
}

export interface EngineState {
  current_step: string | null;
  status: EngineStatus;
  results: Record<string, StepResult>;
  sessions: Record<string, string>;  // stepPath -> sentinel marking the pane has executed this step at least once
  loops: Record<string, { iteration: number }>;  // loop stepPath -> current iteration (for resume)
  history: HistoryEntry[];
  replay_from?: string;  // Step path to skip to during replay (cleared when target is reached)
}
