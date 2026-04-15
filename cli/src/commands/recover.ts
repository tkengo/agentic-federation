import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { resolveSession, readMeta } from "../lib/session.js";
import { loadRepoConfig } from "../lib/repo.js";
import * as tmux from "../lib/tmux.js";
import { loadV2Workflow } from "../lib/engine-v2/workflow-loader.js";
import { applyEnvironmentVars, createV2WindowLayout } from "./start.js";

/**
 * `fed session recover [session-name]`
 *
 * Rebuild tmux session from workflow-v2.yaml for a session whose tmux died.
 * The engine is NOT started automatically — human must run `fed session start-engine`.
 */
export function recoverCommand(sessionName: string | undefined, noAttach?: boolean): void {
  if (!sessionName) {
    console.error("Error: session name is required for recover.");
    process.exit(1);
  }

  // Resolve session directory from active symlink
  const sessionPath = resolveSession(sessionName);
  if (!sessionPath) {
    console.error(`Error: No active session found for '${sessionName}'.`);
    process.exit(1);
  }

  // Read meta.json
  const meta = readMeta(sessionPath);
  if (!meta) {
    console.error(`Error: No meta.json found in ${sessionPath}`);
    process.exit(1);
  }

  const tmuxSession = meta.tmux_session;

  // tmux session must NOT already exist
  if (tmux.hasSession(tmuxSession)) {
    console.error(`Error: tmux session '${tmuxSession}' already exists. Nothing to recover.`);
    process.exit(1);
  }

  // v2 only — check workflow-v2.yaml exists
  const workflowYamlPath = path.join(sessionPath, "workflow-v2.yaml");
  if (!fs.existsSync(workflowYamlPath)) {
    console.error("Error: workflow-v2.yaml not found. Only v2 sessions can be recovered.");
    process.exit(1);
  }

  const cwd = meta.worktree || sessionPath;

  console.log(`=== fed session recover ===`);
  console.log(`Session:  ${sessionName}`);
  console.log(`Path:     ${sessionPath}`);
  console.log(`Worktree: ${cwd}`);

  // Load repo config for env vars (if repo-based session)
  let repoEnv: Record<string, string> | undefined;
  if (meta.repo) {
    try {
      const config = loadRepoConfig(meta.repo);
      repoEnv = config.env;
    } catch {
      // Repo config may not exist anymore, continue without it
      console.warn(`Warning: Could not load repo config for '${meta.repo}', skipping env vars.`);
    }
  }

  // Rebuild user-defined windows from workflow definition
  const v2Workflow = loadV2Workflow(workflowYamlPath);
  const engineEnabled = v2Workflow.engine !== false;
  const windows = v2Workflow.windows ?? [];

  console.log("Creating tmux session...");

  if (engineEnabled) {
    // Engine mode: create with engine window
    tmux.newSession(tmuxSession, cwd, "engine");
    applyEnvironmentVars(tmuxSession, repoEnv);
    tmux.sendKeys(`${tmuxSession}:engine.1`, `export FED_SESSION=${tmuxSession} FED_SESSION_DIR=${sessionPath}`);
    // NOTE: Engine is NOT started — human must run `fed session start-engine`

    for (const win of windows) {
      console.log(`Creating window: ${win.name}...`);
      tmux.newWindow(tmuxSession, win.name, cwd);
      createV2WindowLayout(tmuxSession, win, cwd, sessionPath);
    }
  } else {
    // No-engine mode: create with first user window
    const firstWin = windows[0];
    if (!firstWin) {
      console.error("Error: engine: false workflow must define at least one window.");
      process.exit(1);
    }
    tmux.newSession(tmuxSession, cwd, firstWin.name);
    applyEnvironmentVars(tmuxSession, repoEnv);
    createV2WindowLayout(tmuxSession, firstWin, cwd, sessionPath);

    for (let i = 1; i < windows.length; i++) {
      const win = windows[i];
      console.log(`Creating window: ${win.name}...`);
      tmux.newWindow(tmuxSession, win.name, cwd);
      createV2WindowLayout(tmuxSession, win, cwd, sessionPath);
    }
  }

  // Focus the specified window (default to first user window, or engine)
  const defaultFocus = engineEnabled ? (windows[0]?.name ?? "engine") : windows[0]?.name;
  const focusWindow = v2Workflow.focus ?? defaultFocus;
  if (focusWindow) {
    tmux.selectWindow(`${tmuxSession}:${focusWindow}`);
  }

  // Customize tmux status bar
  tmux.setOption(tmuxSession, "status-style", "bg=colour22,fg=white");
  const label = meta.repo
    ? `${meta.workflow}:${meta.repo}/${meta.branch} (v2 recovered)`
    : `${meta.workflow} (v2 recovered)`;
  tmux.setOption(tmuxSession, "status-right", ` ⚡fed v2 ▸ ${label} `);

  console.log("");
  console.log("=== Session Recovered ===");
  if (engineEnabled) {
    console.log("Engine is NOT running. Start it with:");
    console.log("  fed session start-engine");
  }
  console.log("");

  if (noAttach) {
    console.log("Session recovered (--no-attach). Skipping tmux attach.");
  } else {
    console.log("Attaching to tmux session...");
    execSync(`tmux attach -t '${tmuxSession}'`, { stdio: "inherit" });
  }
}
