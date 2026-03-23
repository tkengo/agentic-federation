import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execSync, spawn } from "node:child_process";
import { ACTIVE_DIR, WORKFLOWS_DIR, CLAUDE_AGENTS_DIR } from "../lib/paths.js";
import { loadRepoConfig } from "../lib/repo.js";
import { createSessionDir, linkActiveSession, resolveSession } from "../lib/session.js";
import * as tmux from "../lib/tmux.js";
import type { MetaJson, StateJson, RepoConfig } from "../lib/types.js";
import { initCommand } from "./init.js";
import {
  loadWorkflowByName,
  getEntryPointState,
  expandTemplateVariables,
  composeAgentInstruction,
  applyWorkflowOverrides,
  type WorkflowDefinition,
  type WorkflowWindow,
} from "../lib/workflow.js";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

// Max retries for generating a unique branch name
const MAX_BRANCH_RETRIES = 10;

function generateBranchCandidate(repoName: string): string {
  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2, "0")
    + String(now.getMinutes()).padStart(2, "0");
  const hex = crypto.randomBytes(2).toString("hex");
  return `${repoName}-${hhmm}-${hex}`;
}

function generateUniqueBranchName(repoName: string): string {
  for (let i = 0; i < MAX_BRANCH_RETRIES; i++) {
    const candidate = generateBranchCandidate(repoName);
    // Check: tmux session does not exist
    if (tmux.hasSession(candidate)) continue;
    // Check: active symlink does not exist
    if (fs.existsSync(path.join(ACTIVE_DIR, candidate))) continue;
    return candidate;
  }
  console.error("Error: failed to generate a unique branch name after retries.");
  process.exit(1);
}

export async function startCommand(
  workflowName: string,
  repoName: string | undefined,
  branch: string | undefined,
  noAttach?: boolean,
  sessionName?: string,
  cliEnvVars?: Record<string, string>
): Promise<void> {
  // ============================================================
  // Preflight checks (no side effects - fail fast before any mutation)
  // ============================================================

  // 1. Must run outside tmux
  if (process.env.TMUX) {
    console.error("Error: fed session start must be run outside of tmux.");
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
    console.log(`Auto-generated session: ${tmuxSession}`);
  } else if (branch) {
    tmuxSession = branch;
  } else {
    // Auto-generate branch name: <repo>-<HHMM>-<4hex>
    branch = generateUniqueBranchName(repoName!);
    console.log(`Auto-generated branch: ${branch}`);
    tmuxSession = branch;
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
    console.error(`  Stop it first: fed session stop '${tmuxSession}'`);
    process.exit(1);
  }

  // ============================================================
  // All checks passed - begin side effects
  // ============================================================

  // Load workflow source (for validation)
  loadWorkflowByName(workflowName);

  if (isStandalone) {
    startStandalone(workflowName, tmuxSession, noAttach, cliEnvVars);
  } else {
    startWithRepo(workflowName, repoName!, branch!, config!, worktreePath, tmuxSession, noAttach, cliEnvVars);
  }
}

// --- Standalone session (no repo) ---
function startStandalone(
  workflowName: string,
  tmuxSession: string,
  noAttach?: boolean,
  cliEnvVars?: Record<string, string>
): void {
  console.log(`=== fed session start (standalone) ===`);
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

  // Cleanup broken agent symlinks, compose and link agent instructions
  cleanupStaleAgentLinks();
  const composedAgents1 = syncAgents(workflowName, tmuxSession, sessionPath, null, meta);
  linkAgents(composedAgents1);

  // Create logs directory
  fs.mkdirSync(path.join(sessionPath, "logs"), { recursive: true });

  // Generic window creation loop
  for (let i = 0; i < workflow.windows.length; i++) {
    const win = workflow.windows[i]!;
    if (i === 0) {
      console.log(`Creating tmux session (window: ${win.name})...`);
      tmux.newSession(tmuxSession, cwd, win.name);
      tmux.setEnvironment(tmuxSession, "FED_SESSION", tmuxSession);
      // Apply CLI --env variables (standalone has no repo config env)
      applyEnvironmentVars(tmuxSession, {}, cliEnvVars);
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

  // Dispatch entry point tasks (for declarative workflows)
  dispatchEntryPointTasks(sessionPath, workflow);

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
  noAttach?: boolean,
  cliEnvVars?: Record<string, string>
): void {
  console.log(`=== fed session start ===`);
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

  // Cleanup broken agent symlinks, compose and link agent instructions
  cleanupStaleAgentLinks();
  const composedAgents2 = syncAgents(workflowName, tmuxSession, sessionPath, config, meta);
  linkAgents(composedAgents2);

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
      // Apply repo config env + CLI --env variables
      applyEnvironmentVars(tmuxSession, config.env, cliEnvVars);
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

  // Dispatch entry point tasks (for declarative workflows)
  dispatchEntryPointTasks(sessionPath, workflow);

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

// --- Apply environment variables to tmux session ---
// Merges repo config env and CLI --env, with CLI taking precedence.
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

// --- Create window layout from WorkflowWindow definition ---
export function createWindowLayout(
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
    // Set per-pane environment variables before running the pane command
    tmux.sendKeys(`${w}.${pane.pane}`, `export FED_PANE=${pane.id} FED_WINDOW=${win.name}`);
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

  // Pre-populate pending_tasks if the entry point state has tasks defined
  const entryStateDef = entryPoint ? workflow.states[entryPoint] : undefined;
  const initialPendingTasks = entryStateDef?.tasks
    ? entryStateDef.tasks.map((t) => t.pane)
    : [];

  const state: StateJson = {
    session_name: session,
    status: entryPoint,
    workflow: workflow.name,
    retry_count: {},
    pending_tasks: initialPendingTasks,
    escalation: { required: false, reason: null },
    history: [],
  };
  fs.writeFileSync(
    path.join(sessionPath, "state.json"),
    JSON.stringify(state, null, 2) + "\n"
  );
}

// --- Dispatch entry point tasks for declarative workflows ---
// Sends notifications to panes assigned in the entry point state's tasks.
// Called after tmux session creation and notification watcher startup.
function dispatchEntryPointTasks(
  sessionPath: string,
  workflow: WorkflowDefinition
): void {
  const entryPoint = getEntryPointState(workflow);
  if (!entryPoint) return;

  const entryStateDef = workflow.states[entryPoint];
  if (!entryStateDef?.tasks || entryStateDef.tasks.length === 0) return;

  const meta = JSON.parse(
    fs.readFileSync(path.join(sessionPath, "meta.json"), "utf-8")
  ) as MetaJson;

  for (const task of entryStateDef.tasks) {
    const message = task.message
      ?? `'fed prompt read ${task.agent}' を実行して作業を開始してください。`;

    // Find tmux target for this pane ID
    let target = "";
    for (const win of workflow.windows) {
      const pane = win.panes.find((p) => p.id === task.pane);
      if (pane) {
        target = `${meta.tmux_session}:${win.name}.${pane.pane}`;
        break;
      }
    }
    if (!target) continue;

    // Write notification file
    const notifyDir = path.join(sessionPath, "notifications");
    fs.mkdirSync(notifyDir, { recursive: true });
    const ts = Date.now();
    const notifyFile = path.join(notifyDir, `${ts}_${task.pane}.notify`);
    fs.writeFileSync(notifyFile, `${target}\n${message}\n`);
  }

  console.log(`Dispatched ${entryStateDef.tasks.length} entry point task(s)`);
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

  let wf = parseYaml(expandedYaml) as WorkflowDefinition;

  // Apply repo-specific workflow overrides
  const overrides = config.workflow_overrides[workflowName];
  if (overrides) {
    wf = applyWorkflowOverrides(wf, overrides);
  }

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
export function startNotificationWatcher(
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

// --- Compose and write agent instructions to session dir ---
// Returns list of absolute paths to composed files (for symlink creation).
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

// --- Link composed agent files to ~/.claude/agents/ ---
function linkAgents(composedFiles: string[]): void {
  if (composedFiles.length === 0) return;
  fs.mkdirSync(CLAUDE_AGENTS_DIR, { recursive: true });

  for (const filePath of composedFiles) {
    const fileName = path.basename(filePath);
    const linkPath = path.join(CLAUDE_AGENTS_DIR, fileName);
    syncSymlink(filePath, linkPath);
  }
  console.log(`Linked ${composedFiles.length} agents to ~/.claude/agents/`);
}

// --- Cleanup stale agent symlinks in ~/.claude/agents/ ---
// Removes symlinks that are broken OR point to non-active sessions.
function cleanupStaleAgentLinks(): void {
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
