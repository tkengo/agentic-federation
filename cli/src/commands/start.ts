import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { ACTIVE_DIR, WORKFLOWS_DIR, CLAUDE_AGENTS_DIR } from "../lib/paths.js";
import { createSessionDir, linkActiveSession, resolveSession } from "../lib/session.js";
import { loadRepoConfig } from "../lib/repo.js";
import * as tmux from "../lib/tmux.js";
import type { MetaJson, RepoConfig } from "../lib/types.js";
import { initCommand } from "./init.js";
import { loadV2Workflow } from "../lib/engine-v2/workflow-loader.js";
import type { V2Window } from "../lib/engine-v2/types.js";
import { initV2State } from "../lib/engine-v2/state.js";
import { stringify as stringifyYaml } from "yaml";
import { composeAgentInstruction } from "../lib/workflow.js";

/**
 * `fed session start <workflow> [repo] [branch]`
 *
 * Start a v2 engine-driven workflow session.
 */
export async function startCommand(
  workflowName: string,
  repoName: string | undefined,
  branch: string | undefined,
  noAttach?: boolean,
  sessionName?: string,
  envVars?: Record<string, string>,
  from?: string,
): Promise<void> {
  // Must run outside tmux
  if (process.env.TMUX) {
    console.error("Error: fed session start must be run outside of tmux.");
    process.exit(1);
  }

  initCommand();

  const isStandalone = !repoName;

  // --from requires repo
  if (from && !repoName) {
    console.error("Error: --from requires a repository name.");
    process.exit(1);
  }

  // Determine tmux session name
  let tmuxSession: string;
  if (sessionName) {
    tmuxSession = sessionName;
  } else if (isStandalone) {
    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2, "0")
      + String(now.getMinutes()).padStart(2, "0");
    const hex = crypto.randomBytes(2).toString("hex");
    tmuxSession = `${workflowName}-${hhmm}-${hex}`;
    console.log(`Auto-generated session: ${tmuxSession}`);
  } else if (from) {
    // --from specified: derive branch name from remote ref if not explicitly given
    if (!branch) {
      branch = extractBranchFromRemote(from);
    }
    tmuxSession = branch;
  } else if (branch) {
    tmuxSession = branch;
  } else {
    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2, "0")
      + String(now.getMinutes()).padStart(2, "0");
    const hex = crypto.randomBytes(2).toString("hex");
    branch = `${repoName}-${hhmm}-${hex}`;
    console.log(`Auto-generated branch: ${branch}`);
    tmuxSession = branch;
  }

  // Preflight checks
  if (tmux.hasSession(tmuxSession)) {
    console.error(`Error: tmux session '${tmuxSession}' already exists.`);
    process.exit(1);
  }
  if (resolveSession(tmuxSession)) {
    console.error(`Error: active session '${tmuxSession}' already exists.`);
    process.exit(1);
  }

  // Validate v2 workflow exists
  const fedRepoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
  const srcV2Workflow = path.join(fedRepoRoot, "workflows", workflowName, "workflow-v2.yaml");
  if (!fs.existsSync(srcV2Workflow)) {
    console.error(`Error: v2 workflow not found: ${srcV2Workflow}`);
    console.error(`  Expected: workflows/${workflowName}/workflow-v2.yaml`);
    process.exit(1);
  }

  // Setup repo and worktree (if repo-based)
  let config: RepoConfig | null = null;
  let worktreePath = "";

  if (!isStandalone) {
    config = loadRepoConfig(repoName!);
    worktreePath = path.join(config.worktree_base, branch!);

    if (fs.existsSync(worktreePath)) {
      console.error(`Error: worktree directory already exists: ${worktreePath}`);
      process.exit(1);
    }

    // Create worktree
    console.log("Fetching latest from origin...");
    execSync(`git -C '${config.repo_root}' fetch origin`, { stdio: "inherit" });

    if (from) {
      console.log(`Creating worktree tracking ${from}...`);
      execSync(
        `git -C '${config.repo_root}' worktree add '${worktreePath}' -b '${branch}' --track '${from}'`,
        { stdio: "inherit" }
      );
    } else {
      console.log(`Creating worktree from ${config.base_branch}...`);
      execSync(
        `git -C '${config.repo_root}' worktree add '${worktreePath}' -b '${branch}' ${config.base_branch}`,
        { stdio: "inherit" }
      );
    }

    // Symlinks
    for (const link of config.symlinks) {
      const target = path.join(config.repo_root, link);
      const linkPath = path.join(worktreePath, link);
      if (!fs.existsSync(linkPath) && fs.existsSync(target)) {
        fs.symlinkSync(target, linkPath);
      }
    }

    // Copy files
    for (const copy of config.copy_files) {
      const src = path.join(config.repo_root, copy);
      const dest = path.join(worktreePath, copy);
      if (!fs.existsSync(dest) && fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
    }

    // Setup scripts
    for (const script of config.setup_scripts) {
      console.log(`Running setup: ${script}`);
      execSync(script, { cwd: worktreePath, stdio: "pipe" });
    }
  }

  // Create session dir + meta.json
  const meta: MetaJson = {
    repo: repoName ?? "",
    branch: branch ?? "",
    workflow: workflowName,
    worktree: worktreePath,
    tmux_session: tmuxSession,
    session_dir: "",
    created_at: new Date().toISOString(),
  };
  const sessionPath = createSessionDir(repoName ?? "_standalone", meta);
  const cwd = worktreePath || sessionPath;

  console.log(`=== fed session start ===`);
  console.log(`Workflow: ${workflowName}`);
  if (repoName) console.log(`Repo:     ${repoName}`);
  if (branch) console.log(`Branch:   ${branch}`);
  console.log(`Session:  ${sessionPath}`);

  // Active symlink
  linkActiveSession(tmuxSession, sessionPath);

  // Worktree symlink
  if (worktreePath) {
    fs.symlinkSync(worktreePath, path.join(sessionPath, "worktree"));
  }

  // Create session directories
  fs.mkdirSync(path.join(sessionPath, "artifacts"), { recursive: true });
  fs.mkdirSync(path.join(sessionPath, "respond"), { recursive: true });
  fs.mkdirSync(path.join(sessionPath, "logs"), { recursive: true });

  // Copy workflow YAML as-is (${{ }} expressions are evaluated at runtime by the engine)
  const rawYaml = fs.readFileSync(srcV2Workflow, "utf-8");
  fs.writeFileSync(path.join(sessionPath, "workflow-v2.yaml"), rawYaml);

  // Validate the expanded workflow
  loadV2Workflow(path.join(sessionPath, "workflow-v2.yaml"));

  // Initialize v2 state
  initV2State(sessionPath);

  // Compose and link agent instructions
  syncCommands();
  cleanupStaleAgentLinks();
  const composedAgents = syncAgents(workflowName, tmuxSession, sessionPath, config, meta);
  linkAgents(composedAgents);

  // Create tmux session with [engine] window
  console.log("Creating tmux session...");
  tmux.newSession(tmuxSession, cwd, "engine");

  // Apply environment variables (repo config env + CLI --env)
  applyEnvironmentVars(tmuxSession, config?.env, envVars);

  // Set per-pane env vars for engine window
  tmux.sendKeys(`${tmuxSession}:engine.1`, `export FED_SESSION=${tmuxSession} FED_SESSION_DIR=${sessionPath}`);

  // Start engine process in the engine pane
  tmux.sendKeys(`${tmuxSession}:engine.1`, `fed session start-engine ${tmuxSession}`);

  // Create user-defined windows from workflow definition
  const v2Workflow = loadV2Workflow(path.join(sessionPath, "workflow-v2.yaml"));
  const windows = v2Workflow.windows ?? [];

  for (const win of windows) {
    console.log(`Creating window: ${win.name}...`);
    tmux.newWindow(tmuxSession, win.name, cwd);
    createV2WindowLayout(tmuxSession, win, cwd, sessionPath);
  }

  // Focus the specified window (default to first user window, or engine)
  const focusWindow = v2Workflow.focus ?? windows[0]?.name ?? "engine";
  tmux.selectWindow(`${tmuxSession}:${focusWindow}`);

  // Customize tmux status bar
  tmux.setOption(tmuxSession, "status-style", "bg=colour22,fg=white");
  const label = repoName
    ? `${workflowName}:${repoName}/${branch}`
    : workflowName;
  tmux.setOption(tmuxSession, "status-right", ` ⚡fed ▸ ${label} `);

  console.log("");
  console.log("=== Engine Ready ===");
  console.log("Windows:");
  console.log("  1. engine (workflow engine)");
  for (let i = 0; i < windows.length; i++) {
    const win = windows[i];
    const paneIds = win.panes.map(p => p.id).join(", ");
    console.log(`  ${i + 2}. ${win.name} (${paneIds})`);
  }
  console.log("");

  if (noAttach) {
    console.log("Session created (--no-attach). Skipping tmux attach.");
  } else {
    console.log("Attaching to tmux session...");
    execSync(`tmux attach -t '${tmuxSession}'`, { stdio: "inherit" });
  }
}

/**
 * Create tmux pane layout for a v2 window definition.
 */
export function createV2WindowLayout(
  session: string,
  win: V2Window,
  cwd: string,
  sessionPath: string,
): void {
  const w = `${session}:${win.name}`;

  // Execute layout splits
  for (const split of win.layout.splits) {
    tmux.splitWindow(`${w}.${split.source}`, split.direction, split.percent, cwd);
  }
  tmux.selectPane(`${w}.${win.layout.focus}`);

  // Send commands to panes
  for (const pane of win.panes) {
    tmux.sendKeys(
      `${w}.${pane.pane}`,
      `export FED_PANE=${pane.id} FED_WINDOW=${win.name} FED_SESSION=${session} FED_SESSION_DIR=${sessionPath} FED_REPO_DIR=${cwd}`
    );
    if (pane.command) {
      tmux.sendKeys(`${w}.${pane.pane}`, pane.command);
    }
  }
}

// ---- Shared utilities (used by start.ts and recover.ts) ----

function syncSymlink(src: string, dest: string): void {
  try {
    fs.lstatSync(dest);
    fs.unlinkSync(dest);
  } catch {
    // Does not exist
  }
  fs.symlinkSync(src, dest);
}

/** Apply environment variables to tmux session.
 *  Merges repo config env and CLI --env, with CLI taking precedence. */
export function applyEnvironmentVars(
  session: string,
  repoEnv?: Record<string, string>,
  cliEnv?: Record<string, string>
): void {
  const merged = { ...repoEnv, ...cliEnv };
  const keys = Object.keys(merged);
  if (keys.length === 0) return;
  for (const key of keys) {
    tmux.setEnvironment(session, key, merged[key]!);
  }
  console.log(`Set ${keys.length} environment variable(s): ${keys.join(", ")}`);
}

/** Sync commands/skills from fed repo to ~/.claude/commands/ */
export function syncCommands(): void {
  const fedRepo = path.resolve(import.meta.dirname, "..", "..", "..");
  const commandsDir = path.join(fedRepo, "commands");
  const claudeCommandsDir = path.join(os.homedir(), ".claude", "commands");

  if (!fs.existsSync(commandsDir)) {
    return;
  }

  fs.mkdirSync(claudeCommandsDir, { recursive: true });

  const commands = fs.readdirSync(commandsDir).filter((f) => f.endsWith(".md"));
  for (const cmd of commands) {
    syncSymlink(path.join(commandsDir, cmd), path.join(claudeCommandsDir, cmd));
  }
  console.log(`Synced ${commands.length} commands to ~/.claude/commands/`);
}

/** Compose and write agent instructions to session dir.
 *  Returns list of absolute paths to composed files (for symlink creation). */
export function syncAgents(
  workflowName: string,
  tmuxSession: string,
  sessionDir: string,
  config: RepoConfig | null,
  meta: MetaJson
): string[] {
  const fedRepoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
  const wfAgentsDir = path.join(WORKFLOWS_DIR, workflowName, "agents");

  if (!fs.existsSync(wfAgentsDir)) {
    console.log("No agent instructions found.");
    return [];
  }

  const agentsOutputDir = path.join(sessionDir, "agents");
  fs.mkdirSync(agentsOutputDir, { recursive: true });

  const bindings: Record<string, unknown> = {
    repo: config ?? {},
    meta,
  };

  const files = fs.readdirSync(wfAgentsDir).filter((f) => f.endsWith(".md"));
  const composedFiles: string[] = [];

  for (const file of files) {
    const src = path.join(wfAgentsDir, file);
    const content = fs.readFileSync(src, "utf-8");
    let composed = composeAgentInstruction(content, fedRepoRoot, bindings);

    // Derive role name: strip workflow prefix if present
    const baseName = file.replace(/\.md$/, "");
    const role = baseName.startsWith(`${workflowName}-`)
      ? baseName.slice(workflowName.length + 1)
      : baseName;
    const newName = `__fed-${workflowName}-${tmuxSession}-${role}`;
    const newFileName = `${newName}.md`;

    // Rewrite frontmatter name field
    composed = composed.replace(
      /^(name:\s*).+$/m,
      `$1${newName}`
    );

    const outPath = path.join(agentsOutputDir, newFileName);
    fs.writeFileSync(outPath, composed);
    composedFiles.push(outPath);
  }

  console.log(`Composed ${composedFiles.length} agents to ${agentsOutputDir}`);
  return composedFiles;
}

/** Link composed agent files to ~/.claude/agents/ */
export function linkAgents(composedFiles: string[]): void {
  if (composedFiles.length === 0) return;
  fs.mkdirSync(CLAUDE_AGENTS_DIR, { recursive: true });

  for (const filePath of composedFiles) {
    const fileName = path.basename(filePath);
    const linkPath = path.join(CLAUDE_AGENTS_DIR, fileName);
    syncSymlink(filePath, linkPath);
  }
  console.log(`Linked ${composedFiles.length} agents to ~/.claude/agents/`);
}

/** Cleanup stale agent symlinks in ~/.claude/agents/.
 *  Removes symlinks that are broken OR point to non-active sessions. */
export function cleanupStaleAgentLinks(): void {
  if (!fs.existsSync(CLAUDE_AGENTS_DIR)) return;

  // Collect active session directories from ~/.fed/active/ symlinks
  const activeSessionDirs = new Set<string>();
  if (fs.existsSync(ACTIVE_DIR)) {
    for (const entry of fs.readdirSync(ACTIVE_DIR)) {
      const linkPath = path.join(ACTIVE_DIR, entry);
      try {
        const target = fs.realpathSync(linkPath);
        activeSessionDirs.add(target);
      } catch {
        // Broken active symlink, skip
      }
    }
  }

  const files = fs.readdirSync(CLAUDE_AGENTS_DIR);
  let cleaned = 0;
  for (const file of files) {
    const linkPath = path.join(CLAUDE_AGENTS_DIR, file);
    try {
      const stat = fs.lstatSync(linkPath);
      if (!stat.isSymbolicLink()) continue;

      // Remove if broken
      if (!fs.existsSync(linkPath)) {
        fs.unlinkSync(linkPath);
        cleaned++;
        continue;
      }

      // Remove if target is not under an active session directory
      const target = fs.realpathSync(linkPath);
      const belongsToActive = [...activeSessionDirs].some((dir) =>
        target.startsWith(dir + path.sep)
      );
      if (!belongsToActive) {
        fs.unlinkSync(linkPath);
        cleaned++;
      }
    } catch {
      // Skip errors
    }
  }
  if (cleaned > 0) {
    console.log(`Cleaned up ${cleaned} stale agent symlink(s) in ~/.claude/agents/`);
  }
}

/** Extract branch name from remote ref (e.g., "origin/feature-xyz" -> "feature-xyz") */
function extractBranchFromRemote(remoteBranch: string): string {
  const slashIndex = remoteBranch.indexOf("/");
  if (slashIndex === -1) {
    return remoteBranch;
  }
  return remoteBranch.slice(slashIndex + 1);
}
