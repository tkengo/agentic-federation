import path from "node:path";
import os from "node:os";

// Mirror of cli/src/lib/types.ts
export interface MetaJson {
  repo: string;
  branch: string;
  mode: "solo" | "team";
  worktree: string;
  tmux_session: string;
  created_at: string;
}

export interface StateJson {
  session_name: string;
  status: string;
  retry_count: { plan_review: number; code_review: number };
  pending_reviews: string[];
  escalation: { required: boolean; reason: string | null };
  history: Array<{
    ts: string;
    event: string;
    status: string;
    detail?: string;
  }>;
}

export const ARTIFACT_MAP: Record<string, string> = {
  plan: "plan.md",
  implementation: "implementation.md",
  plan_review_gemini: "reviews/plan_review_gemini.md",
  plan_review_codex: "reviews/plan_review_codex.md",
  code_review_gemini: "reviews/code_review_gemini.md",
  code_review_codex: "reviews/code_review_codex.md",
  human_feedback: "human_feedback.md",
};

// Mirror of cli/src/lib/paths.ts
export const FED_HOME = path.join(os.homedir(), ".fed");
export const SESSIONS_DIR = path.join(FED_HOME, "sessions");
export const ACTIVE_DIR = path.join(FED_HOME, "active");
export const ARCHIVE_DIR = path.join(FED_HOME, "archive");

// Status -> preview artifact mapping
export const STATUS_PREVIEW_MAP: Record<string, string[]> = {
  PLAN_REVIEW: ["plan"],
  PLAN_REVISION: ["plan_review_gemini", "plan_review_codex"],
  CODE_REVIEW: ["implementation"],
  CODE_REVISION: ["code_review_gemini", "code_review_codex"],
  WAITING_HUMAN: ["human_feedback"],
};

// Session data used by the dashboard
export interface SessionData {
  name: string;
  sessionDir: string;
  meta: MetaJson;
  status: string;
  pendingReviews: string[];
  escalation: { required: boolean; reason: string | null };
}
