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
} from "./commands/repo.js";
import { setSessionOverride } from "./lib/session.js";
import { startCommand } from "./commands/start.js";
import { stateReadCommand, stateUpdateCommand } from "./commands/state.js";
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
import { infoCommand } from "./commands/info.js";
import { dashCommand } from "./commands/dash.js";
import { describeSetCommand, describeShowCommand } from "./commands/describe.js";
import {
  workflowListCommand,
  workflowShowCommand,
  workflowValidateCommand,
} from "./commands/workflow.js";
import {
  repoScriptListCommand,
  repoScriptShowCommand,
  repoScriptRunCommand,
} from "./commands/repo-script.js";
import { claudeCommand } from "./commands/claude.js";
import { restoreCommand } from "./commands/restore.js";
import { convListCommand, convShowCommand } from "./commands/conv.js";

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
    if (repo && !branch) {
      console.error("Error: branch is required when repo is specified.");
      console.error("  Usage: fed session start <workflow> <repo> <branch>");
      console.error("  For standalone (no repo): fed session start <workflow> [--session-name <name>]");
      process.exit(1);
    }
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
  .option("--restorable", "Show only restorable sessions (tmux dead)")
  .option("--limit <n>", "Max sessions to show (default: 20)", parseInt)
  .action((options: { active?: boolean; archive?: boolean; restorable?: boolean; limit?: number }) => {
    listCommand(options);
  });

session
  .command("show [session-name]")
  .description("Show detailed session information")
  .action((sessionName?: string) => {
    infoCommand(sessionName);
  });

session
  .command("archive <session-name>")
  .description("Archive a specific session")
  .action((sessionName: string) => {
    archiveCommand(sessionName);
  });

session
  .command("restore <session-name>")
  .description("Restore a session after tmux loss")
  .option("--no-attach", "Skip tmux attach after restore")
  .action((sessionName: string, options: { attach?: boolean }) => {
    restoreCommand(sessionName, options.attach === false);
  });

// --- state ---
const state = program
  .command("state")
  .description("Read/update workflow state (state.json)");

state
  .command("read [field]")
  .description("Read state.json (optionally a specific field, e.g. 'status')")
  .option("--nvim", "Open the file in nvim instead of printing to stdout")
  .action((field: string | undefined, options: { nvim?: boolean }) => {
    stateReadCommand(field, options.nvim);
  });

state
  .command("update <field> <value>")
  .description("Update a field in state.json (e.g. 'status plan_review')")
  .action((field: string, value: string) => {
    stateUpdateCommand(field, value);
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
  .command("list")
  .description("List available workflows")
  .action(() => {
    workflowListCommand();
  });

workflow
  .command("show [name]")
  .description("Show workflow YAML content (omit name for current session)")
  .action((name?: string) => {
    workflowShowCommand(name);
  });

workflow
  .command("validate <name>")
  .description("Validate a workflow definition")
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

// --- claude ---
program
  .command("claude")
  .description("Launch Claude Code with automatic session ID tracking")
  .allowUnknownOption()
  .allowExcessArguments()
  .action((_options: Record<string, unknown>, cmd: Command) => {
    claudeCommand(cmd.args);
  });

program.parse();
