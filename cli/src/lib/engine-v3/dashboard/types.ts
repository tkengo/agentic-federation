export type StepStatus = "not_started" | "running" | "completed" | "failed" | "waiting_human" | "waiting_network" | "skipped";

/**
 * A flattened row in the step tree display.
 * Built from V2Workflow at startup, then updated by events.
 */
export interface StepNode {
  /** Dot-delimited path, e.g. "plan_review_cycle.review" */
  stepPath: string;
  /** Display label (id or auto-generated name) */
  label: string;
  /** Step type for badge display */
  stepType: string;
  /** Nesting depth for indentation */
  depth: number;
  /** Current status */
  status: StepStatus;
  /** Result value (after completion) */
  result?: string;
  /** Duration in ms (after completion) */
  durationMs?: number;
  /** Description from workflow definition */
  description?: string;
  /** Branch condition (from parent case's `if` field) */
  condition?: string;
  /** Loop iteration info (e.g. "1/5") */
  iterationLabel?: string;
}
