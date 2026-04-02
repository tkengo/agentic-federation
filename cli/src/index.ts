#!/usr/bin/env node

import { initLogger } from "./lib/logger.js";
import { Command } from "commander";

// Initialize global logging before any command runs
initLogger(process.argv);
import { initCommand } from "./commands/init.js";
import {
  repoAddCommand,
  repoAddLocalCommand,
  repoListCommand,
  repoShowCommand,
  repoEditCommand,
  repoDeleteCommand,
  repoRenameCommand,
} from "./commands/repo.js";
import { setSessionOverride } from "./lib/session.js";
import { startCommand } from "./commands/start.js";
import {
  artifactReadCommand,
  artifactWriteCommand,
  artifactListCommand,
  artifactDeleteCommand,
} from "./commands/artifact.js";
import { notifyCommand } from "./commands/notify.js";
import { promptReadCommand, promptListCommand } from "./commands/prompt.js";
import { notifyHumanCommand } from "./commands/notify-human.js";
import {
  waitingHumanSetCommand,
  waitingHumanClearCommand,
  waitingHumanShowCommand,
} from "./commands/waiting-human.js";
import { listCommand } from "./commands/list.js";
import { stopCommand } from "./commands/stop.js";
import { archiveCommand } from "./commands/archive.js";
import { cleanCommand } from "./commands/clean.js";
import { workflowStatusCommand } from "./commands/workflow-status.js";
import { dashCommand } from "./commands/dash.js";
import { describeSetCommand, describeShowCommand } from "./commands/describe.js";
import { workflowValidateCommand } from "./commands/workflow.js";
import {
  repoScriptListCommand,
  repoScriptShowCommand,
  repoScriptRunCommand,
} from "./commands/repo-script.js";
import { recoverCommand } from "./commands/recover.js";
import { workflowEngineCommand } from "./commands/workflow-engine.js";
import { workflowRespondCommand } from "./commands/workflow-respond.js";
import { workflowAbortCommand } from "./commands/workflow-abort.js";
import { convListCommand, convShowCommand } from "./commands/conv.js";
import { configGetCommand, configSetCommand, configShowCommand } from "./commands/config.js";
import {
  filesSaveCommand,
  filesReadCommand,
  filesListCommand,
  filesDirCommand,
} from "./commands/files.js";
import {
  worktreeListCommand,
  worktreeProtectCommand,
  worktreeUnprotectCommand,
} from "./commands/worktree.js";

const program = new Command();

program
  .name("fed")
  .description("Agentic Federation CLI - unified development session manager")
  .version("0.1.0")
  .option("--session <name>", "Override tmux session name for session resolution");

program.hook("preAction", (thisCommand) => {
  const opts = program.opts();
  if (opts.session) {
    setSessionOverride(opts.session);
  }
});

program
  .command("init")
  .description("Initialize ~/.fed/ directory structure")
  .action(() => {
    initCommand();
  });

// --- repo ---
const repo = program
  .command("repo")
  .description("Manage repository definitions");

repo
  .command("add <clone-url> [base-path]")
  .description("Clone a repository and register it")
  .option("--base-branch <branch>", "Base branch for worktree creation (default: main)")
  .action((cloneUrl: string, basePath: string | undefined, opts: { baseBranch?: string }) => {
    repoAddCommand(cloneUrl, basePath, opts.baseBranch);
  });

repo
  .command("add-local <repo-path> [base-path]")
  .description("Register an existing local repository")
  .option("--base-branch <branch>", "Base branch for worktree creation (default: main)")
  .action((repoPath: string, basePath: string | undefined, opts: { baseBranch?: string }) => {
    repoAddLocalCommand(repoPath, basePath, opts.baseBranch);
  });

repo
  .command("list")
  .description("List all repository definitions")
  .action(() => {
    repoListCommand();
  });

repo
  .command("show <name>")
  .description("Show repository definition details")
  .action((name: string) => {
    repoShowCommand(name);
  });

repo
  .command("edit <name>")
  .description("Edit repository definition with $EDITOR")
  .action((name: string) => {
    repoEditCommand(name);
  });

repo
  .command("rename <old-name> <new-name>")
  .description("Rename a repository")
  .action((oldName: string, newName: string) => {
    repoRenameCommand(oldName, newName);
  });

repo
  .command("delete <name>")
  .description("Delete a repository and its workspace")
  .option("--force", "Skip confirmation prompt")
  .action(async (name: string, opts: { force?: boolean }) => {
    await repoDeleteCommand(name, opts.force ?? false);
  });

// --- session ---
const session = program
  .command("session")
  .description("Manage development sessions");

session
  .command("start <workflow> [repo] [branch]")
  .description("Start a development session with a workflow")
  .option("--no-attach", "Skip tmux attach after creation")
  .option("--session-name <name>", "Custom tmux session name (auto-generated for standalone if omitted)")
  .option("-e, --env <KEY=VALUE...>", "Environment variables to set in all panes (repeatable)")
  .action(async (workflow: string, repo: string | undefined, branch: string | undefined, options: { attach?: boolean; sessionName?: string; env?: string[] }) => {
    // Parse --env KEY=VALUE pairs into a record
    const envVars: Record<string, string> = {};
    for (const pair of options.env ?? []) {
      const eq = pair.indexOf("=");
      if (eq === -1) {
        console.error(`Error: invalid --env format: '${pair}' (expected KEY=VALUE)`);
        process.exit(1);
      }
      envVars[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    await startCommand(workflow, repo, branch, options.attach === false, options.sessionName, envVars);
  });

session
  .command("recover [session-name]")
  .description("Recover a session whose tmux session has been lost (v2 only)")
  .option("--no-attach", "Skip tmux attach after recovery")
  .action((sessionName?: string, options?: { attach?: boolean }) => {
    recoverCommand(sessionName, options?.attach === false);
  });

session
  .command("stop [session-name]")
  .description("Stop a session (current tmux session if not specified)")
  .action((sessionName?: string) => {
    stopCommand(sessionName);
  });

session
  .command("list")
  .alias("ls")
  .description("List sessions")
  .option("--active", "Show active sessions (default: true)")
  .option("--no-active", "Hide active sessions")
  .option("--archive", "Show archived sessions")
  .option("--no-archive", "Hide archived sessions (default)")
  .option("--limit <n>", "Max sessions to show (default: 20)", parseInt)
  .action((options: { active?: boolean; archive?: boolean; limit?: number }) => {
    listCommand(options);
  });

session
  .command("status [session-name]")
  .description("Show current workflow step status")
  .action((sessionName?: string) => {
    workflowStatusCommand(sessionName);
  });

session
  .command("start-engine [session-name]")
  .description("Start the v2 workflow engine (resumes from last completed step)")
  .option("--reset", "Reset state and start from the beginning")
  .action((sessionName?: string, options?: { reset?: boolean }) => {
    workflowEngineCommand(sessionName, options?.reset);
  });

session
  .command("respond-workflow [value]")
  .description("Report step result to the v2 workflow engine")
  .option("--step <path>", "Step path (auto-detected from FED_STEP)")
  .action(async (value: string | undefined, options: { step?: string }) => {
    await workflowRespondCommand(value, options.step);
  });

session
  .command("abort-workflow")
  .description("Abort the running v2 workflow")
  .option("--graceful", "Wait for current step to finish before aborting")
  .action((options: { graceful?: boolean }) => {
    workflowAbortCommand(options);
  });

session
  .command("archive <session-name>")
  .description("Archive a specific session")
  .action((sessionName: string) => {
    archiveCommand(sessionName);
  });

// --- artifact ---
const artifact = program
  .command("artifact")
  .description("Read/write session artifacts");

artifact
  .command("read <name>")
  .description("Read an artifact to stdout")
  .option("--nvim", "Open the file in nvim instead of printing to stdout")
  .action((name: string, options: { nvim?: boolean }) => {
    artifactReadCommand(name, options.nvim);
  });

artifact
  .command("write <name>")
  .description("Write an artifact from stdin or file")
  .option("--file <path>", "Read content from file instead of stdin (file is deleted after write)")
  .option("--keep", "Keep the source file when using --file")
  .action((name: string, options: { file?: string; keep?: boolean }) => {
    artifactWriteCommand(name, options);
  });

artifact
  .command("list")
  .description("List available artifacts")
  .action(() => {
    artifactListCommand();
  });

artifact
  .command("delete <name>")
  .description("Delete an artifact")
  .action((name: string) => {
    artifactDeleteCommand(name);
  });

// --- notify ---
program
  .command("notify <pane> <message>")
  .description("Send a notification to a tmux pane")
  .action((pane: string, message: string) => {
    notifyCommand(pane, message);
  });

// --- prompt ---
const prompt = program
  .command("prompt")
  .description("Read agent prompts");

prompt
  .command("read <name>")
  .description("Read a prompt by name")
  .option("--nvim", "Open the file in nvim instead of printing to stdout")
  .action((name: string, options: { nvim?: boolean }) => {
    promptReadCommand(name, options.nvim);
  });

prompt
  .command("list")
  .description("List available prompts")
  .action(() => {
    promptListCommand();
  });

// --- notify-human ---
program
  .command("notify-human <title> <message>")
  .description("Send macOS notification to human")
  .action((title: string, message: string) => {
    notifyHumanCommand(title, message);
  });

// --- waiting-human ---
const waitingHuman = program
  .command("waiting-human")
  .description("Manage waiting-for-human state");

waitingHuman
  .command("set")
  .description("Set waiting-for-human state with a reason")
  .requiredOption("--reason <reason>", "Reason for waiting")
  .option("--notify", "Also send macOS notification")
  .action((options: { reason: string; notify?: boolean }) => {
    waitingHumanSetCommand(options.reason, options.notify ?? false);
  });

waitingHuman
  .command("clear")
  .description("Clear waiting-for-human state")
  .action(() => {
    waitingHumanClearCommand();
  });

waitingHuman
  .command("show")
  .description("Show current waiting-for-human state")
  .action(() => {
    waitingHumanShowCommand();
  });

// --- clean ---
program
  .command("clean")
  .description("Clean up worktrees of archived sessions")
  .option("--dry-run", "Show what would be deleted without deleting")
  .option("--force", "Force removal even with uncommitted changes")
  .action((options: { dryRun?: boolean; force?: boolean }) => {
    cleanCommand(options.dryRun ?? false, options.force ?? false);
  });

// --- describe ---
const describe = program
  .command("describe")
  .description("Get or set session description");

describe
  .command("set <text>")
  .description("Set session description")
  .action((text: string) => {
    describeSetCommand(text);
  });

describe
  .command("show")
  .description("Show current session description")
  .action(() => {
    describeShowCommand();
  });

// --- dashboard ---
program
  .command("dashboard")
  .alias("dash")
  .description("Launch interactive dashboard (Ink terminal UI)")
  .action(() => {
    dashCommand();
  });

// --- workflow ---
const workflow = program
  .command("workflow")
  .description("Manage workflow definitions");

workflow
  .command("validate <name>")
  .description("Validate a v2 workflow definition")
  .action((name: string) => {
    workflowValidateCommand(name);
  });

// --- repo-script ---
const repoScript = program
  .command("repo-script")
  .description("Run repo-defined scripts");

repoScript
  .command("list")
  .description("List available scripts")
  .action(() => {
    repoScriptListCommand();
  });

repoScript
  .command("show <name>")
  .description("Show script details")
  .action((name: string) => {
    repoScriptShowCommand(name);
  });

repoScript
  .command("run <name>")
  .description("Run a script")
  .action((name: string) => {
    repoScriptRunCommand(name);
  });

// --- conv ---
const conv = program
  .command("conv")
  .description("View collected conversations from AI tools");

conv
  .command("list")
  .description("List collected conversation files")
  .action(() => {
    convListCommand();
  });

conv
  .command("show <name>")
  .description("Show a conversation in human-readable format")
  .option("--raw", "Output raw JSONL instead of formatted text")
  .action((name: string, options: { raw?: boolean }) => {
    convShowCommand(name, options.raw);
  });

// --- config ---
const config = program
  .command("config")
  .description("Manage fed configuration (~/.fed/config.json)");

config
  .command("get [key]")
  .description("Get a config value (or all config if no key)")
  .action((key?: string) => {
    configGetCommand(key);
  });

config
  .command("set <key> <value>")
  .description("Set a config value (dot notation supported, e.g. 'files.dir')")
  .action((key: string, value: string) => {
    configSetCommand(key, value);
  });

config
  .command("show")
  .description("Show all config keys with current values and defaults")
  .action(() => {
    configShowCommand();
  });

// --- files ---
const files = program
  .command("files")
  .description("Manage knowledge base files");

files
  .command("save <name>")
  .description("Save a file to the knowledge base")
  .option("--file <path>", "Read content from file instead of stdin (file is deleted after write)")
  .option("--keep", "Keep the source file when using --file")
  .option("--overwrite", "Overwrite existing file with the same name")
  .action((name: string, options: { file?: string; keep?: boolean; overwrite?: boolean }) => {
    filesSaveCommand(name, options);
  });

files
  .command("read <name>")
  .description("Read a file from the knowledge base")
  .action((name: string) => {
    filesReadCommand(name);
  });

files
  .command("list")
  .description("List knowledge base files")
  .option("--limit <n>", "Max files to show (default: 50)", parseInt)
  .option("--offset <n>", "Start from this index (default: 0)", parseInt)
  .action((options: { limit?: number; offset?: number }) => {
    filesListCommand(options);
  });

files
  .command("dir")
  .description("Print the knowledge base directory path")
  .action(() => {
    filesDirCommand();
  });

// --- worktree ---
const worktree = program
  .command("worktree")
  .description("Manage worktrees and their protection");

worktree
  .command("list")
  .description("List all worktrees with protection status")
  .option("--protected", "Show only protected worktrees")
  .option("--no-protected", "Show only unprotected worktrees")
  .action((options: { protected?: boolean }) => {
    worktreeListCommand(options.protected);
  });

worktree
  .command("protect <repo> <branch>")
  .description("Protect a worktree from cleanup")
  .action((repo: string, branch: string) => {
    worktreeProtectCommand(repo, branch);
  });

worktree
  .command("unprotect <repo> <branch>")
  .description("Remove worktree cleanup protection")
  .action((repo: string, branch: string) => {
    worktreeUnprotectCommand(repo, branch);
  });

program.parse();
