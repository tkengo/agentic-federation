import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execSync, spawn } from "node:child_process";
import { CLAUDE_AGENTS_DIR, WORKFLOWS_DIR } from "../lib/paths.js";
import { loadRepoConfig } from "../lib/repo.js";
import { createSessionDir, linkActiveSession, resolveSession } from "../lib/session.js";
import * as tmux from "../lib/tmux.js";
import type { MetaJson, StateJson, RepoConfig } from "../lib/types.js";
import { initCommand } from "./init.js";
import {
  loadWorkflowByName,
  getEntryPointState,
  expandTemplateVariables,
  type WorkflowDefinition,
  type WorkflowWindow,
} from "../lib/workflow.js";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export async function startCommand(
  workflowName: string,
  repoName: string | undefined,
  branch: string | undefined,
  noAttach?: boolean,
  sessionName?: string
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

  const isStandalone = !repoName;

  // Determine tmux session name
  let tmuxSession: string;
  if (sessionName) {
    tmuxSession = sessionName;
  } else if (isStandalone) {
    // Auto-generate: <workflow>-<HHMM>-<4hex>
    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2, "0")
      + String(now.getMinutes()).padStart(2, "0");
    const hex = crypto.randomBytes(2).toString("hex");
    tmuxSession = `${workflowName}-${hhmm}-${hex}`;
  } else {
    tmuxSession = branch!;
  }

  // --- Repo-specific preflight checks (skipped for standalone) ---
  let config: RepoConfig | null = null;
  let worktreePath = "";

  if (!isStandalone) {
    config = loadRepoConfig(repoName!);
    worktreePath = path.join(config.worktree_base, branch!);

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
        console.error(`Error: git branch '${branch!}' already exists.`);
        console.error(`  Delete it first: git -C '${config.repo_root}' branch -d '${branch}'`);
        process.exit(1);
      }
    } catch {
      // git branch --list failed, proceed (non-fatal)
    }
  }

  // --- Common preflight checks ---

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

  // Load workflow source (for validation)
  loadWorkflowByName(workflowName);

  if (isStandalone) {
    startStandalone(workflowName, tmuxSession, noAttach);
  } else {
    startWithRepo(workflowName, repoName!, branch!, config!, worktreePath, tmuxSession, noAttach);
  }
}

// --- Standalone session (no repo) ---
function startStandalone(
  workflowName: string,
  tmuxSession: string,
  noAttach?: boolean
): void {
  console.log(`=== fed start (standalone) ===`);
  console.log(`Workflow: ${workflowName}`);
  console.log(`Session:  ${tmuxSession}`);

  // Create session directory + meta.json
  const meta: MetaJson = {
    repo: "",
    branch: "",
    workflow: workflowName,
    worktree: "",
    tmux_session: tmuxSession,
    session_dir: "", // set by createSessionDir
    created_at: new Date().toISOString(),
  };
  const sessionPath = createSessionDir("_standalone", meta);
  const cwd = sessionPath; // Use session dir as tmux cwd
  console.log(`Dir:      ${sessionPath}`);

  // Active symlink
  linkActiveSession(tmuxSession, sessionPath);

  // Template-expand workflow YAML (no repo bindings)
  const workflow = expandAndSaveWorkflowStandalone(sessionPath, workflowName, meta);

  // Create session infrastructure
  initSession(sessionPath, tmuxSession, workflow);

  // Sync commands (skills)
  syncCommands();

  // Sync agent prompts to ~/.claude/agents/
  syncAgents(workflowName);

  // Create logs directory
  fs.mkdirSync(path.join(sessionPath, "logs"), { recursive: true });

  // Generic window creation loop
  for (let i = 0; i < workflow.windows.length; i++) {
    const win = workflow.windows[i]!;
    if (i === 0) {
      console.log(`Creating tmux session (window: ${win.name})...`);
      tmux.newSession(tmuxSession, cwd, win.name);
      tmux.setEnvironment(tmuxSession, "FED_SESSION", tmuxSession);
    } else {
      console.log(`Creating window: ${win.name}...`);
      tmux.newWindow(tmuxSession, win.name, cwd);
    }
    createWindowLayout(tmuxSession, win, cwd);
  }

  // Focus the specified window (defaults to first window)
  const focusWindow = workflow.focus || workflow.windows[0]!.name;
  tmux.selectWindow(`${tmuxSession}:${focusWindow}`);

  // Customize tmux status bar
  tmux.setOption(tmuxSession, "status-style", "bg=colour24,fg=white");
  tmux.setOption(tmuxSession, "status-right", ` ⚡fed ▸ ${workflowName}:${tmuxSession} `);

  // Start notification watcher
  startNotificationWatcher(sessionPath, tmuxSession);

  // Attach
  printReadyAndAttach(workflow, tmuxSession, noAttach);
}

// --- Repo-based session (existing behavior) ---
function startWithRepo(
  workflowName: string,
  repoName: string,
  branch: string,
  config: RepoConfig,
  worktreePath: string,
  tmuxSession: string,
  noAttach?: boolean
): void {
  console.log(`=== fed start ===`);
  console.log(`Workflow: ${workflowName}`);
  console.log(`Repo:     ${repoName}`);
  console.log(`Branch:   ${branch}`);
  console.log(`Worktree: ${worktreePath}`);
  if (tmuxSession !== branch) {
    console.log(`Session:  ${tmuxSession}`);
  }

  // Cleanup old Claude project data
  cleanupClaude(config);

  // Worktree setup
  setupWorktree(config, branch, worktreePath);

  // Create session directory + meta.json
  const meta: MetaJson = {
    repo: repoName,
    branch,
    workflow: workflowName,
    worktree: worktreePath,
    tmux_session: tmuxSession,
    session_dir: "", // set by createSessionDir
    created_at: new Date().toISOString(),
  };
  const sessionPath = createSessionDir(repoName, meta);
  console.log(`Session:  ${sessionPath}`);

  // Create symlink: sessionDir/worktree -> worktree path
  fs.symlinkSync(worktreePath, path.join(sessionPath, "worktree"));

  // Active symlink
  linkActiveSession(tmuxSession, sessionPath);

  // Template-expand workflow YAML, save to session dir, and get expanded object
  const workflow = expandAndSaveWorkflow(sessionPath, workflowName, config, meta);

  // Always create session infrastructure
  initSession(sessionPath, tmuxSession, workflow);

  // Sync commands (skills)
  syncCommands();

  // Sync agent prompts to ~/.claude/agents/
  syncAgents(workflowName);

  // Create logs directory
  const logsDir = path.join(sessionPath, "logs");
  fs.mkdirSync(logsDir, { recursive: true });

  // Generic window creation loop
  for (let i = 0; i < workflow.windows.length; i++) {
    const win = workflow.windows[i]!;
    if (i === 0) {
      // First window: create tmux session
      console.log(`Creating tmux session (window: ${win.name})...`);
      tmux.newSession(tmuxSession, worktreePath, win.name);

      // Set FED_SESSION before any pane commands run.
      // Agents like Codex that cannot access the tmux socket rely on this
      // environment variable to identify the session.
      tmux.setEnvironment(tmuxSession, "FED_SESSION", tmuxSession);
    } else {
      // Subsequent windows
      console.log(`Creating window: ${win.name}...`);
      tmux.newWindow(tmuxSession, win.name, worktreePath);
    }
    createWindowLayout(tmuxSession, win, worktreePath);
  }

  // Focus the specified window (defaults to first window)
  const focusWindow = workflow.focus || workflow.windows[0]!.name;
  tmux.selectWindow(`${tmuxSession}:${focusWindow}`);

  // Customize tmux status bar for fed session
  tmux.setOption(tmuxSession, "status-style", "bg=colour24,fg=white");
  const statusLabel = tmuxSession !== branch
    ? `${workflowName}:${repoName}/${branch} (${tmuxSession})`
    : `${workflowName}:${repoName}/${branch}`;
  tmux.setOption(tmuxSession, "status-right", ` ⚡fed ▸ ${statusLabel} `);

  // Start notification watcher
  startNotificationWatcher(sessionPath, tmuxSession);

  // Attach
  printReadyAndAttach(workflow, tmuxSession, noAttach);
}

// --- Print ready message and optionally attach ---
function printReadyAndAttach(
  workflow: WorkflowDefinition,
  tmuxSession: string,
  noAttach?: boolean
): void {
  console.log("");
  console.log("=== Environment Ready ===");
  console.log("");
  console.log("Windows:");
  for (let i = 0; i < workflow.windows.length; i++) {
    const win = workflow.windows[i]!;
    console.log(`  ${i + 1}. ${win.name}`);
  }
  console.log("");
  if (noAttach) {
    console.log("Session created (--no-attach). Skipping tmux attach.");
  } else {
    console.log("Attaching to tmux session...");
    execSync(`tmux attach -t '${tmuxSession}'`, { stdio: "inherit" });
  }
}

// --- Create window layout from WorkflowWindow definition ---
function createWindowLayout(
  session: string,
  win: WorkflowWindow,
  cwd: string
): void {
  const w = `${session}:${win.name}`;

  // Execute layout splits
  for (const split of win.layout.splits) {
    tmux.splitWindow(`${w}.${split.source}`, split.direction, split.percent, cwd);
  }
  tmux.selectPane(`${w}.${win.layout.focus}`);

  // Send commands to panes
  for (const pane of win.panes) {
    if (pane.command) {
      tmux.sendKeys(`${w}.${pane.pane}`, pane.command);
    }
  }
}

// --- Worktree setup ---
function setupWorktree(
  config: RepoConfig,
  branch: string,
  worktreePath: string
): void {
  if (fs.existsSync(worktreePath)) {
    console.log(`Worktree already exists: ${worktreePath}`);
  } else {
    console.log("Fetching latest from origin...");
    execSync(`git -C '${config.repo_root}' fetch origin`, {
      stdio: "inherit",
    });
    console.log(`Creating worktree from ${config.base_branch}...`);
    execSync(`git -C '${config.repo_root}' worktree add '${worktreePath}' -b '${branch}' ${config.base_branch}`, {
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
  for (const copy of config.copy_files) {
    const src = path.join(config.repo_root, copy);
    const dest = path.join(worktreePath, copy);
    if (fs.existsSync(dest)) {
      console.log(`  Skipped: ${copy} (already exists)`);
    } else if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      console.log(`  Copied: ${copy}`);
    } else {
      console.log(`  Skipped: ${copy} (source not found)`);
    }
  }

  // Run setup scripts
  for (const script of config.setup_scripts) {
    console.log(`Running setup: ${script}`);
    execSync(script, { cwd: worktreePath, stdio: "inherit" });
  }
}

// --- Session initialization (always runs) ---
function initSession(
  sessionPath: string,
  session: string,
  workflow: WorkflowDefinition
): void {
  fs.mkdirSync(path.join(sessionPath, "artifacts"), { recursive: true });
  fs.mkdirSync(path.join(sessionPath, "notifications"), { recursive: true });

  const entryPoint = getEntryPointState(workflow);
  const state: StateJson = {
    session_name: session,
    status: entryPoint,
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

// --- Template-expand workflow YAML, save to session dir, return expanded object ---
function expandAndSaveWorkflow(
  sessionPath: string,
  workflowName: string,
  config: RepoConfig,
  meta: MetaJson
): WorkflowDefinition {
  const fedRepo = path.resolve(import.meta.dirname, "..", "..", "..");
  const srcWorkflowDir = path.join(fedRepo, "workflows", workflowName);
  const srcWorkflow = path.join(srcWorkflowDir, "workflow.yaml");
  const rawYaml = fs.readFileSync(srcWorkflow, "utf-8");
  const expandedYaml = expandTemplateVariables(rawYaml, { repo: config, meta });

  const wf = parseYaml(expandedYaml) as WorkflowDefinition;

  fs.writeFileSync(
    path.join(sessionPath, "workflow.yaml"),
    stringifyYaml(wf)
  );
  return wf;
}

// --- Template-expand workflow YAML for standalone (no repo config) ---
function expandAndSaveWorkflowStandalone(
  sessionPath: string,
  workflowName: string,
  meta: MetaJson
): WorkflowDefinition {
  const fedRepo = path.resolve(import.meta.dirname, "..", "..", "..");
  const srcWorkflow = path.join(fedRepo, "workflows", workflowName, "workflow.yaml");
  const rawYaml = fs.readFileSync(srcWorkflow, "utf-8");
  // No repo bindings - template vars like {{repo.*}} resolve to ""
  const expandedYaml = expandTemplateVariables(rawYaml, { repo: {}, meta });
  const wf = parseYaml(expandedYaml) as WorkflowDefinition;
  fs.writeFileSync(path.join(sessionPath, "workflow.yaml"), stringifyYaml(wf));
  return wf;
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

// --- Sync commands/skills ---
function syncCommands(): void {
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

// --- Sync agent prompts to ~/.claude/agents/ ---
function syncAgents(workflowName: string): void {
  fs.mkdirSync(CLAUDE_AGENTS_DIR, { recursive: true });

  let count = 0;

  // Workflow-specific agents: workflows/<name>/agents/*.md -> ~/.claude/agents/*.md
  const wfAgentsDir = path.join(WORKFLOWS_DIR, workflowName, "agents");
  if (fs.existsSync(wfAgentsDir)) {
    const files = fs.readdirSync(wfAgentsDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const src = path.join(wfAgentsDir, file);
      const dest = path.join(CLAUDE_AGENTS_DIR, file);
      syncSymlink(src, dest);
      count++;
    }
  }

  console.log(`Synced ${count} agents to ~/.claude/agents/`);
}

function syncSymlink(src: string, dest: string): void {
  try {
    fs.lstatSync(dest);
    fs.unlinkSync(dest);
  } catch {
    // Does not exist
  }
  fs.symlinkSync(src, dest);
}

// --- Cleanup old Claude project data ---
function cleanupClaude(config: RepoConfig): void {
  if (!config.cleanup_pattern) {
    return;
  }

  console.log("Cleaning up old Claude data...");
  const homeDir = os.homedir();

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
