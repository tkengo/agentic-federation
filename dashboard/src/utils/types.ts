import path from "node:path";
import os from "node:os";

// Mirror of cli/src/lib/types.ts
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

// Mirror of cli/src/lib/paths.ts
export const FED_HOME = path.join(os.homedir(), ".fed");
export const SESSIONS_DIR = path.join(FED_HOME, "sessions");
export const ACTIVE_DIR = path.join(FED_HOME, "active");
export const ARCHIVE_DIR = path.join(FED_HOME, "archive");
export const REPOS_DIR = path.join(FED_HOME, "repos");

// Stale threshold in seconds (must match stale-watcher.ts)
export const STALE_THRESHOLD_SEC = 600;

// Status display config (mark + color) per state
export interface StatusConfig {
  mark: string;
  color: string;
}

// Waiting-for-human state
export interface WaitingHumanData {
  waiting: boolean;
  reason: string | null;
}

// Repository info for dashboard display
export interface RepoInfo {
  name: string;
  repoRoot: string;
}

// Session data used by the dashboard
export interface SessionData {
  name: string;
  sessionDir: string;
  meta: MetaJson;
  status: string;
  workflow?: string;
  pendingTasks: string[];
  escalation: { required: boolean; reason: string | null };
  waitingHuman: WaitingHumanData;
  description?: string;
  stateMtimeMs?: number;
  statusConfigMap?: Record<string, StatusConfig>;
}
