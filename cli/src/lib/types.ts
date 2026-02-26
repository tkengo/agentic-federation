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

// Artifact name -> relative file path within session directory
export const ARTIFACT_MAP: Record<string, string> = {
  plan: "plan.md",
  implementation: "implementation.md",
  plan_review_gemini: "reviews/plan_review_gemini.md",
  plan_review_codex: "reviews/plan_review_codex.md",
  code_review_gemini: "reviews/code_review_gemini.md",
  code_review_codex: "reviews/code_review_codex.md",
  human_feedback: "human_feedback.md",
};

export interface RepoConfig {
  repo_root: string;
  worktree_base: string;
  setup: string;
  dev_server: string | null;
  symlinks: string[];
  copies: string[];
  cleanup_pattern: string;
}
