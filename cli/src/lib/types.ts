export interface MetaJson {
  repo: string;
  branch: string;
  workflow: string;
  worktree: string;
  tmux_session: string;
  session_dir: string;
  created_at: string;
  from?: string;
}

// Script definition (stored in repo config JSON)
export interface ScriptDef {
  path: string;
  description?: string;
  env?: Record<string, string>;
  cwd?: string;
}

// Workflow override for repo-specific customization
export interface WorkflowPaneOverride {
  command: string;
}

export interface WorkflowWindowOverride {
  panes?: Record<string, WorkflowPaneOverride>; // key = pane id
}

export interface WorkflowOverride {
  windows?: Record<string, WorkflowWindowOverride>; // key = window name
}

// New JSON format saved by `fed repo add <clone-url>`
export interface NewRepoConfig {
  repo_name: string;
  base_path: string;
  base_branch?: string;
  repo_root?: string; // Override: path to existing local repo
  setup_scripts: string[];
  symlinks: string[];
  copy_files: string[];
  extra: Record<string, unknown>;
  scripts?: Record<string, ScriptDef>;
  env?: Record<string, string>;
  workflow_overrides?: Record<string, WorkflowOverride>; // key = workflow name
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
  env: Record<string, string>;
  workflow_overrides: Record<string, WorkflowOverride>;
}
