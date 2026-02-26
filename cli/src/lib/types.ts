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
  workflow?: string;
  retry_count: Record<string, number>;
  pending_tasks: string[];
  escalation: { required: boolean; reason: string | null };
  history: Array<{
    ts: string;
    event: string;
    status: string;
    detail?: string;
  }>;
}

export interface RepoConfig {
  repo_root: string;
  worktree_base: string;
  setup: string;
  dev_server: string | null;
  symlinks: string[];
  copies: string[];
  cleanup_pattern: string;
}
