import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync, spawn } from "node:child_process";
import { SESSIONS_DIR, ACTIVE_DIR } from "../lib/paths.js";
import { loadRepoConfig } from "../lib/repo.js";
import { createSessionDir, linkActiveSession, resolveSession } from "../lib/session.js";
import * as tmux from "../lib/tmux.js";
import type { MetaJson, StateJson, RepoConfig } from "../lib/types.js";
import { initCommand } from "./init.js";
import {
  loadWorkflowByName,
  getEntryPointState,
  type WorkflowDefinition,
} from "../lib/workflow.js";

export async function startCommand(
  repoName: string,
  branch: string,
  workflowName?: string
): Promise<void> {
  // ============================================================
  // Preflight checks (no side effects - fail fast before any mutation)
  // ============================================================

  // 1. Must run outside tmux
  if (process.env.TMUX) {
    console.error("Error: fed start must be run outside of tmux.");
    process.exit(1);
  }

  // Ensure ~/.fed/ structure exists
  initCommand();

  const config = loadRepoConfig(repoName);
  const worktreePath = path.join(config.worktree_base, branch);
  const tmuxSession = branch;

  // 2. repo_root must be a valid git repo
  if (!fs.existsSync(config.repo_root)) {
    console.error(`Error: repo_root does not exist: ${config.repo_root}`);
    process.exit(1);
  }
  try {
    execSync(`git -C '${config.repo_root}' rev-parse --git-dir`, {
      stdio: "ignore",
    });
  } catch {
    console.error(`Error: repo_root is not a git repository: ${config.repo_root}`);
    process.exit(1);
  }

  // 3. worktree_base must exist
  if (!fs.existsSync(config.worktree_base)) {
    console.error(`Error: worktree_base does not exist: ${config.worktree_base}`);
    console.error(`  Create it first: mkdir -p '${config.worktree_base}'`);
    process.exit(1);
  }

  // 4. Worktree directory must not already exist
  if (fs.existsSync(worktreePath)) {
    console.error(`Error: worktree directory already exists: ${worktreePath}`);
    console.error(`  Remove it first, or use a different branch name.`);
    process.exit(1);
  }

  // 5. Branch must not already exist in git
  try {
    const existing = execSync(
      `git -C '${config.repo_root}' branch --list '${branch}'`,
      { encoding: "utf-8" }
    ).trim();
    if (existing) {
      console.error(`Error: git branch '${branch}' already exists.`);
      console.error(`  Delete it first: git -C '${config.repo_root}' branch -d '${branch}'`);
      process.exit(1);
    }
  } catch {
    // git branch --list failed, proceed (non-fatal)
  }

  // 6. tmux session must not already exist
  if (tmux.hasSession(tmuxSession)) {
    console.error(`Error: tmux session '${tmuxSession}' already exists.`);
    console.error(`  Kill it first: tmux kill-session -t '${tmuxSession}'`);
    process.exit(1);
  }

  // 7. Active symlink conflict check
  const existingSession = resolveSession(tmuxSession);
  if (existingSession) {
    console.error(`Error: active session '${tmuxSession}' already exists.`);
    console.error(`  Stop it first: fed stop '${tmuxSession}'`);
    process.exit(1);
  }

  // ============================================================
  // All checks passed - begin side effects
  // ============================================================

  // Load workflow if specified
  let workflow: WorkflowDefinition | undefined;
  if (workflowName) {
    workflow = loadWorkflowByName(workflowName);
  }
  const mode = workflow ? "team" : "solo";

  console.log(`=== fed start ===`);
  console.log(`Repo:     ${repoName}`);
  console.log(`Branch:   ${branch}`);
  console.log(`Mode:     ${mode}`);
  if (workflow) {
    console.log(`Workflow: ${workflow.name}`);
  }
  console.log(`Worktree: ${worktreePath}`);

  // Cleanup old Claude project data
  cleanupClaude(config);

  // Worktree setup
  setupWorktree(config, branch, worktreePath);

  // Create session directory + meta.json
  const meta: MetaJson = {
    repo: repoName,
    branch,
    mode,
    worktree: worktreePath,
    tmux_session: tmuxSession,
    created_at: new Date().toISOString(),
  };
  const sessionPath = createSessionDir(repoName, meta);
  console.log(`Session:  ${sessionPath}`);

  // Active symlink
  linkActiveSession(tmuxSession, sessionPath);

  // Team mode: create state.json, notifications/
  if (workflow) {
    initTeamSession(sessionPath, tmuxSession, workflow);
  }

  // Sync commands (skills)
  syncCommands();

  // Create tmux session with dev window
  createDevWindow(tmuxSession, worktreePath, config);

  // Team mode: create agent-team window
  if (workflow) {
    createAgentTeamWindow(tmuxSession, worktreePath, sessionPath, workflow);
  }

  // Attach
  console.log("");
  console.log("=== Environment Ready ===");
  console.log("");
  console.log("Windows:");
  console.log("  1. dev        - terminal, nvim" + (config.dev_server ? `, ${config.dev_server}` : ""));
  if (workflow) {
    console.log("  2. agent-team - Agent Team");
  }
  console.log("");
  console.log("Attaching to tmux session...");
  execSync(`tmux attach -t '${tmuxSession}'`, { stdio: "inherit" });
}

// --- 1-4. Worktree setup ---
function setupWorktree(
  config: RepoConfig,
  branch: string,
  worktreePath: string
): void {
  // Create worktree if it doesn't exist
  if (fs.existsSync(worktreePath)) {
    console.log(`Worktree already exists: ${worktreePath}`);
  } else {
    console.log("Creating worktree...");
    execSync(`git -C '${config.repo_root}' worktree add '${worktreePath}' -b '${branch}'`, {
      stdio: "inherit",
    });
  }

  // Create symlinks
  console.log("Creating symbolic links...");
  for (const link of config.symlinks) {
    const target = path.join(config.repo_root, link);
    const linkPath = path.join(worktreePath, link);
    if (fs.existsSync(linkPath)) {
      console.log(`  Skipped: ${link} (already exists)`);
    } else if (fs.existsSync(target)) {
      fs.symlinkSync(target, linkPath);
      console.log(`  Created symlink: ${link}`);
    } else {
      console.log(`  Skipped: ${link} (source not found)`);
    }
  }

  // Copy files
  for (const copy of config.copies) {
    const src = path.join(config.repo_root, copy);
    const dest = path.join(worktreePath, copy);
    if (fs.existsSync(dest)) {
      console.log(`  Skipped: ${copy} (already exists)`);
    } else if (fs.existsSync(src)) {
      // Ensure parent directory exists
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      console.log(`  Copied: ${copy}`);
    } else {
      console.log(`  Skipped: ${copy} (source not found)`);
    }
  }

  // Run setup command
  if (config.setup) {
    console.log(`Running setup: ${config.setup}`);
    execSync(config.setup, { cwd: worktreePath, stdio: "inherit" });
  }
}

// --- 1-5. Dev window ---
function createDevWindow(
  session: string,
  cwd: string,
  config: RepoConfig
): void {
  console.log("Creating tmux session...");
  tmux.newSession(session, cwd, "dev");

  const devWindow = `${session}:dev`;

  if (config.dev_server) {
    // 3-pane layout: terminal | nvim / dev_server
    tmux.splitWindow(`${devWindow}.1`, "v", 10, cwd);
    tmux.splitWindow(`${devWindow}.1`, "h", 50, cwd);
    tmux.sendKeys(`${devWindow}.2`, "nvim");
    tmux.sendKeys(`${devWindow}.3`, config.dev_server);
  } else {
    // 2-pane layout: terminal | nvim
    tmux.splitWindow(`${devWindow}.1`, "h", 50, cwd);
    tmux.sendKeys(`${devWindow}.2`, "nvim");
  }

  tmux.selectPane(`${devWindow}.1`);
}

// --- 1-7. Agent team window ---
function createAgentTeamWindow(
  session: string,
  cwd: string,
  sessionPath: string,
  workflow: WorkflowDefinition
): void {
  console.log("Creating agent-team window...");

  // Create logs directory in session
  const logsDir = path.join(sessionPath, "logs");
  fs.mkdirSync(logsDir, { recursive: true });

  // Copy workflow.yaml to session for runtime reference
  const fedRepo = path.resolve(import.meta.dirname, "..", "..");
  const srcWorkflow = path.join(fedRepo, "workflows", `${workflow.name}.yaml`);
  if (fs.existsSync(srcWorkflow)) {
    fs.copyFileSync(srcWorkflow, path.join(sessionPath, "workflow.yaml"));
  }

  // Create agent-team window with layout from workflow
  const windowName = workflow.layout.window_name;
  tmux.newWindow(session, windowName, cwd);
  const w = `${session}:${windowName}`;

  // Execute layout splits from workflow definition
  for (const split of workflow.layout.splits) {
    tmux.splitWindow(`${w}.${split.source}`, split.direction, split.percent, cwd);
  }
  tmux.selectPane(`${w}.${workflow.layout.focus}`);

  // Start commands in panes from workflow pane definitions
  console.log("Starting commands in all panes...");
  for (const pane of workflow.panes) {
    if (pane.command) {
      tmux.sendKeys(`${w}.${pane.pane}`, pane.command);
    }
  }

  // Start TypeScript notification watcher
  startNotificationWatcher(sessionPath, session);

  // Start TypeScript stale watcher
  startStaleWatcherTS(sessionPath, session);

  // Auto-start orchestrator after a delay for agents to initialize
  const orchestratorPane = workflow.panes.find((p) => p.id === "orchestrator");
  if (orchestratorPane) {
    const w = `${session}:${workflow.layout.window_name}`;
    setTimeout(() => {
      tmux.sendKeys(`${w}.${orchestratorPane.pane}`, "/start_orchestrator");
    }, 5000);
    console.log(`Orchestrator will auto-start in pane ${orchestratorPane.pane} after 5s delay.`);
  }

  console.log("Agent Team ready.");
}

// --- Start TypeScript notification watcher as child process ---
function startNotificationWatcher(
  sessionPath: string,
  session: string
): void {
  const watcherScript = path.resolve(
    import.meta.dirname,
    "..",
    "lib",
    "notification-watcher.js"
  );
  if (!fs.existsSync(watcherScript)) {
    console.error("Warning: notification-watcher.js not found, skipping.");
    return;
  }

  const logFile = path.join(sessionPath, "logs", "notification-watcher.log");
  const watcher = spawn("node", [watcherScript, sessionPath, session], {
    stdio: [
      "ignore",
      fs.openSync(logFile, "a"),
      fs.openSync(logFile, "a"),
    ],
    detached: true,
  });
  watcher.unref();
  console.log(`Started notification watcher (PID: ${watcher.pid})`);
}

// --- Start TypeScript stale watcher as child process ---
function startStaleWatcherTS(
  sessionPath: string,
  session: string
): void {
  const watcherScript = path.resolve(
    import.meta.dirname,
    "..",
    "lib",
    "stale-watcher.js"
  );
  if (!fs.existsSync(watcherScript)) {
    console.error("Warning: stale-watcher.js not found, skipping.");
    return;
  }

  // Pause stale watcher initially
  fs.writeFileSync(path.join(sessionPath, ".pause_stale_watcher"), "");

  const logFile = path.join(sessionPath, "logs", "stale-watcher.log");
  const watcher = spawn("node", [watcherScript, sessionPath, session], {
    stdio: [
      "ignore",
      fs.openSync(logFile, "a"),
      fs.openSync(logFile, "a"),
    ],
    detached: true,
  });
  watcher.unref();
  console.log(`Started stale watcher (PID: ${watcher.pid})`);
}

// --- 1-2. Team session initialization ---
function initTeamSession(
  sessionPath: string,
  session: string,
  workflow: WorkflowDefinition
): void {
  fs.mkdirSync(path.join(sessionPath, "artifacts"), { recursive: true });
  fs.mkdirSync(path.join(sessionPath, "notifications"), { recursive: true });

  const state: StateJson = {
    session_name: session,
    status: getEntryPointState(workflow),
    workflow: workflow.name,
    retry_count: {},
    pending_tasks: [],
    escalation: { required: false, reason: null },
    history: [],
  };
  fs.writeFileSync(
    path.join(sessionPath, "state.json"),
    JSON.stringify(state, null, 2) + "\n"
  );
}

// --- 1-6. Sync commands/skills ---
function syncCommands(): void {
  const fedRepo = path.resolve(import.meta.dirname, "..", "..");
  const commandsDir = path.join(fedRepo, "commands");
  const claudeCommandsDir = path.join(os.homedir(), ".claude", "commands");

  if (!fs.existsSync(commandsDir)) {
    return;
  }

  fs.mkdirSync(claudeCommandsDir, { recursive: true });

  const commands = fs.readdirSync(commandsDir).filter((f) => f.endsWith(".md"));
  for (const cmd of commands) {
    const src = path.join(commandsDir, cmd);
    const dest = path.join(claudeCommandsDir, cmd);

    // Remove existing symlink/file before creating new one
    try {
      fs.lstatSync(dest);
      fs.unlinkSync(dest);
    } catch {
      // Does not exist
    }

    fs.symlinkSync(src, dest);
  }
  console.log(`Synced ${commands.length} commands to ~/.claude/commands/`);
}

// --- 1-8. Cleanup old Claude project data ---
function cleanupClaude(config: RepoConfig): void {
  if (!config.cleanup_pattern) {
    return;
  }

  console.log("Cleaning up old Claude data...");
  const homeDir = os.homedir();

  // Clean old cache/debug files
  const cleanDirs = [
    path.join(homeDir, ".claude", "debug"),
    path.join(homeDir, ".claude", "cache"),
    path.join(homeDir, ".claude", "paste-cache"),
  ];
  for (const dir of cleanDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      execSync(`find '${dir}' -type f -mtime +7 -delete 2>/dev/null`, {
        stdio: "ignore",
      });
    } catch {
      // Ignore errors
    }
  }

  // Delete Claude project data for non-existent worktrees
  try {
    const worktreeOutput = execSync(
      `git -C '${config.repo_root}' worktree list --porcelain`,
      { encoding: "utf-8" }
    );
    const worktrees = worktreeOutput
      .split("\n")
      .filter((l) => l.startsWith("worktree "))
      .map((l) => l.slice("worktree ".length));

    const projectsBase = path.join(homeDir, ".claude", "projects");
    if (!fs.existsSync(projectsBase)) return;

    const pattern = config.cleanup_pattern;
    const projectDirs = fs.readdirSync(projectsBase).filter((d) => {
      // Simple glob match: *pattern* -> contains pattern without asterisks
      const cleanPattern = pattern.replace(/\*/g, "");
      return d.includes(cleanPattern);
    });

    for (const dirName of projectDirs) {
      const dirPath = path.join(projectsBase, dirName);
      if (!fs.statSync(dirPath).isDirectory()) continue;

      const matched = worktrees.some((wt) => {
        const encoded = wt.replace(/\//g, "-").replace(/_/g, "-").replace(/^-/, "");
        return dirName === `-${encoded}` || dirName === encoded;
      });

      if (!matched) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(`  Cleaned up: ${dirPath}`);
      }
    }
  } catch {
    // Git command may fail if repo_root doesn't exist, ignore
  }
}
