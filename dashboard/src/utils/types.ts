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
}

// Mirror of cli/src/lib/paths.ts
export const FED_HOME = path.join(os.homedir(), ".fed");
export const SESSIONS_DIR = path.join(FED_HOME, "sessions");
export const ACTIVE_DIR = path.join(FED_HOME, "active");
export const ARCHIVE_DIR = path.join(FED_HOME, "archive");
export const REPOS_DIR = path.join(FED_HOME, "repos");

export const PROTECTED_WORKTREES_FILE = path.join(FED_HOME, "protected-worktrees.json");

export const STALE_THRESHOLD_SEC = 3600;

// Waiting-for-human state
export interface WaitingHumanData {
  waiting: boolean;
  reason: string | null;
}

// Repository info for dashboard display
export interface RepoInfo {
  name: string;
  repoRoot: string;
  tmuxAlive: boolean;
}

// Protected worktree data for dashboard display
export interface ProtectedWorktreeData {
  repo: string;
  branch: string;
  path: string;
}

// Footer override state from Home component
export type FooterOverride =
  | null
  | { type: "cleaning" }
  | { type: "confirmClean"; count: number }
  | { type: "confirmKill"; name: string }
  | { type: "confirmScript"; name: string }
  | { type: "confirmDeleteSession"; name: string }
  | { type: "confirmUnprotect"; name: string }
  | { type: "creating" }
  | { type: "renaming"; name: string };

// Workflow info for dashboard display
export interface WorkflowInfo {
  name: string;
  description: string;
}

// Session data used by the dashboard
export interface SessionData {
  name: string;
  sessionDir: string;
  meta: MetaJson;
  status: string;
  workflow?: string;
  waitingHuman: WaitingHumanData;
  description?: string;
  currentStep?: string | null;
  stateMtimeMs?: number;
  tmuxAlive: boolean;
}
