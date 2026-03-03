export interface MetaJson {
  repo: string;
  branch: string;
  workflow: string;
  worktree: string;
  tmux_session: string;
  session_dir: string;
  created_at: string;
  /** @deprecated old format compat */
  mode?: "solo" | "team";
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

// Script definition (stored in repo config JSON)
export interface ScriptDef {
  path: string;
  description?: string;
  env?: Record<string, string>;
  cwd?: string;
}

// New JSON format saved by `fed repo add <clone-url>`
export interface NewRepoConfig {
  repo_name: string;
  base_path: string;
  base_branch?: string;
  setup_scripts: string[];
  symlinks: string[];
  copy_files: string[];
  extra: Record<string, unknown>;
  scripts?: Record<string, ScriptDef>;
}

// Normalized runtime type — all consumers use this
export interface RepoConfig {
  repo_root: string;
  worktree_base: string;
  cleanup_pattern: string;
  base_branch: string;
  symlinks: string[];
  setup_scripts: string[];
  copy_files: string[];
  extra: Record<string, unknown>;
  scripts: Record<string, ScriptDef>;
}
