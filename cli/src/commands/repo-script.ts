import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { requireSessionDir, readMeta } from "../lib/session.js";
import { loadRepoConfig, resolveRepoScriptPath } from "../lib/repo.js";
import type { MetaJson, RepoConfig, ScriptDef } from "../lib/types.js";

// Load scripts and session context from repo config.
// For standalone sessions (no repo), returns empty scripts.
function loadContext(sessionDir: string): {
  scripts: Record<string, ScriptDef>;
  meta: MetaJson;
  repoConfig: RepoConfig | null;
  sessionDir: string;
} {
  const meta = readMeta(sessionDir);
  if (!meta) {
    console.error("Error: No meta.json found in session directory.");
    process.exit(1);
  }
  if (!meta.repo) {
    // Standalone session - no repo scripts available
    return { scripts: {}, meta, repoConfig: null, sessionDir };
  }
  const repoConfig = loadRepoConfig(meta.repo);
  return { scripts: repoConfig.scripts, meta, repoConfig, sessionDir };
}

// Build auto-injected FED_* environment variables from session context.
function buildAutoEnv(meta: MetaJson, repoConfig: RepoConfig | null): Record<string, string> {
  return {
    FED_SESSION: meta.tmux_session,
    FED_SESSION_DIR: meta.session_dir,
    FED_REPO_DIR: meta.worktree,
    FED_BRANCH: meta.branch,
    FED_REPO: meta.repo,
    FED_WORKFLOW: meta.workflow,
    FED_REPO_ROOT: repoConfig?.repo_root ?? "",
  };
}

export function repoScriptListCommand(): void {
  const sessionDir = requireSessionDir();
  const { scripts } = loadContext(sessionDir);
  const entries = Object.entries(scripts);

  console.log("Repo scripts:");
  if (entries.length === 0) {
    console.log("  (none)");
    return;
  }
  for (const [name, def] of entries) {
    const desc = def.description ? `  ${def.description}` : "";
    console.log(`  ${name.padEnd(24)}${desc}`);
  }
}

export function repoScriptShowCommand(name: string): void {
  const sessionDir = requireSessionDir();
  const { scripts, meta, repoConfig } = loadContext(sessionDir);
  const def = scripts[name];

  if (!def) {
    console.error(`Error: Script '${name}' not found.`);
    console.error(`Available scripts: ${Object.keys(scripts).join(", ") || "(none)"}`);
    process.exit(1);
  }

  const resolvedPath = resolveRepoScriptPath(def.path);
  const autoEnv = buildAutoEnv(meta, repoConfig);

  console.log(`Script: ${name}`);
  if (def.description) {
    console.log(`Description: ${def.description}`);
  }
  console.log(`Path: ${def.path}`);
  console.log(`Resolved: ${resolvedPath}`);
  console.log(`Cwd: ${def.cwd ?? meta.worktree}`);
  console.log("Auto-injected env:");
  for (const [k, v] of Object.entries(autoEnv)) {
    console.log(`  ${k}=${v}`);
  }
  if (def.env && Object.keys(def.env).length > 0) {
    console.log("Script env:");
    for (const [k, v] of Object.entries(def.env)) {
      console.log(`  ${k}=${v}`);
    }
  }
}

export function repoScriptRunCommand(name: string): void {
  const sessionDir = requireSessionDir();
  const { scripts, meta, repoConfig } = loadContext(sessionDir);
  const def = scripts[name];

  if (!def) {
    console.error(`Error: Script '${name}' not found.`);
    console.error(`Available scripts: ${Object.keys(scripts).join(", ") || "(none)"}`);
    process.exit(1);
  }

  const resolvedPath = resolveRepoScriptPath(def.path);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: Script file not found: ${resolvedPath}`);
    process.exit(1);
  }

  // Default cwd to worktree path
  const cwd = def.cwd ?? meta.worktree;

  // Build environment: inherit process env + auto-injected FED_* + script-defined env
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...buildAutoEnv(meta, repoConfig),
  };
  if (def.env) {
    for (const [k, v] of Object.entries(def.env)) {
      env[k] = v;
    }
  }

  console.error(`Running script: ${name} (${resolvedPath})`);
  const result = spawnSync(resolvedPath, {
    cwd,
    env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Error: Failed to execute script: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== null && result.status !== 0) {
    console.error(`Script '${name}' exited with code ${result.status}`);
    process.exit(result.status);
  }
}
