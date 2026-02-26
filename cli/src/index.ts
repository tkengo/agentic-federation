#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import {
  repoAddCommand,
  repoListCommand,
  repoShowCommand,
  repoEditCommand,
} from "./commands/repo.js";
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
import {
  stalePauseCommand,
  staleResumeCommand,
  staleStatusCommand,
} from "./commands/stale.js";
import { notifyHumanCommand } from "./commands/notify-human.js";
import { listCommand } from "./commands/list.js";
import { stopCommand } from "./commands/stop.js";
import { archiveCommand, archiveAllCompletedCommand } from "./commands/archive.js";
import { cleanCommand } from "./commands/clean.js";
import { infoCommand } from "./commands/info.js";
import { dashCommand } from "./commands/dash.js";

const program = new Command();

program
  .name("fed")
  .description("Agentic Federation CLI - unified development session manager")
  .version("0.1.0");

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
  .command("start <repo> <branch>")
  .description("Start a development session")
  .option("--team", "Enable team mode with agent-team window")
  .action(async (repo: string, branch: string, options: { team?: boolean }) => {
    await startCommand(repo, branch, options.team ?? false);
  });

// --- state ---
const state = program
  .command("state")
  .description("Read/update workflow state (state.json)");

state
  .command("read [field]")
  .description("Read state.json (optionally a specific field, e.g. 'status')")
  .action((field?: string) => {
    stateReadCommand(field);
  });

state
  .command("update <field> <value>")
  .description("Update a field in state.json (e.g. 'status PLAN_REVIEW')")
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
  .action((name: string) => {
    artifactReadCommand(name);
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
  .action((name: string) => {
    promptReadCommand(name);
  });

prompt
  .command("list")
  .description("List available prompts")
  .action(() => {
    promptListCommand();
  });

// --- stale ---
const stale = program
  .command("stale")
  .description("Control stale state watcher");

stale
  .command("pause")
  .description("Pause stale notifications")
  .action(() => {
    stalePauseCommand();
  });

stale
  .command("resume")
  .description("Resume stale notifications")
  .action(() => {
    staleResumeCommand();
  });

stale
  .command("status")
  .description("Show stale watcher status")
  .action(() => {
    staleStatusCommand();
  });

// --- notify-human ---
program
  .command("notify-human <title> <message>")
  .description("Send macOS notification to human")
  .action((title: string, message: string) => {
    notifyHumanCommand(title, message);
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

// --- dashboard ---
program
  .command("dashboard")
  .alias("dash")
  .description("Launch interactive dashboard (Ink terminal UI)")
  .action(() => {
    dashCommand();
  });

program.parse();
