#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import {
  repoAddCommand,
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
import { feedbackReadCommand, feedbackWriteCommand } from "./commands/feedback.js";
import { promptReadCommand, promptListCommand } from "./commands/prompt.js";
import { notifyHumanCommand } from "./commands/notify-human.js";
import {
  waitingHumanSetCommand,
  waitingHumanClearCommand,
  waitingHumanShowCommand,
} from "./commands/waiting-human.js";
import { listCommand } from "./commands/list.js";
import { stopCommand } from "./commands/stop.js";
import { archiveCommand, archiveAllCompletedCommand } from "./commands/archive.js";
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
  scriptListCommand,
  scriptShowCommand,
  scriptRunCommand,
} from "./commands/script.js";

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
  .command("add <name>")
  .description("Add a new repository definition interactively")
  .action(async (name: string) => {
    await repoAddCommand(name);
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

// --- start ---
program
  .command("start <workflow> <repo> <branch>")
  .description("Start a development session with a workflow")
  .option("--no-attach", "Skip tmux attach after creation")
  .action(async (workflow: string, repo: string, branch: string, options: { attach?: boolean }) => {
    await startCommand(workflow, repo, branch, options.attach === false);
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
  .option("--force", "Force update even if transition is invalid")
  .action((field: string, value: string, options: { force?: boolean }) => {
    stateUpdateCommand(field, value, options.force ?? false);
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
  .description("Write an artifact from stdin")
  .action((name: string) => {
    artifactWriteCommand(name);
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

// --- feedback ---
const feedback = program
  .command("feedback")
  .description("Manage human feedback");

feedback
  .command("read")
  .description("Read human feedback")
  .action(() => {
    feedbackReadCommand();
  });

feedback
  .command("write")
  .description("Append human feedback from stdin")
  .action(() => {
    feedbackWriteCommand();
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

// --- list ---
program
  .command("list")
  .alias("ls")
  .description("List active sessions")
  .action(() => {
    listCommand();
  });

// --- stop ---
program
  .command("stop [session-name]")
  .description("Stop a session (current tmux session if not specified)")
  .action((sessionName?: string) => {
    stopCommand(sessionName);
  });

// --- archive ---
const archive = program
  .command("archive")
  .description("Archive sessions");

archive
  .command("session <session-name>")
  .description("Archive a specific session")
  .action((sessionName: string) => {
    archiveCommand(sessionName);
  });

archive
  .command("completed")
  .description("Archive all completed/approved sessions")
  .action(() => {
    archiveAllCompletedCommand();
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

// --- info ---
program
  .command("info [session-name]")
  .description("Show detailed session information")
  .action((sessionName?: string) => {
    infoCommand(sessionName);
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
  .command("show <name>")
  .description("Show workflow YAML content")
  .action((name: string) => {
    workflowShowCommand(name);
  });

workflow
  .command("validate <name>")
  .description("Validate a workflow definition")
  .action((name: string) => {
    workflowValidateCommand(name);
  });

// --- script ---
const script = program
  .command("script")
  .description("Run workflow-defined scripts");

script
  .command("list")
  .description("List available scripts")
  .action(() => {
    scriptListCommand();
  });

script
  .command("show <name>")
  .description("Show script details")
  .action((name: string) => {
    scriptShowCommand(name);
  });

script
  .command("run <name>")
  .description("Run a script")
  .action((name: string) => {
    scriptRunCommand(name);
  });

program.parse();
