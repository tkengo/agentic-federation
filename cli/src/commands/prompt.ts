import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { AGENTS_DIR, WORKFLOWS_DIR } from "../lib/paths.js";
import { getCurrentTmuxSession, resolveSession, readMeta } from "../lib/session.js";

/**
 * Resolve the workflow name from the current session, if any.
 * Returns null if not in tmux, no active session, or no workflow set.
 */
function getSessionWorkflow(): string | null {
  const tmuxSession = getCurrentTmuxSession();
  if (!tmuxSession) return null;

  const sessionDir = resolveSession(tmuxSession);
  if (!sessionDir) return null;

  const meta = readMeta(sessionDir);
  return meta?.workflow ?? null;
}

/**
 * Resolve the path to a prompt file.
 * 1. If in a workflow session, try workflows/<workflow>/agents/<name>.md
 * 2. Fall back to prompts/<name>.md
 */
function resolvePromptPath(name: string): string | null {
  const workflow = getSessionWorkflow();
  if (workflow) {
    const wfPath = path.join(WORKFLOWS_DIR, workflow, "agents", `${name}.md`);
    if (fs.existsSync(wfPath)) return wfPath;
  }

  const globalPath = path.join(AGENTS_DIR, `${name}.md`);
  if (fs.existsSync(globalPath)) return globalPath;

  return null;
}

export function promptReadCommand(name: string, nvim?: boolean): void {
  const filePath = resolvePromptPath(name);

  if (!filePath) {
    console.error(
      `Error: Prompt '${name}' not found. Run 'fed prompt list' to see available prompts.`
    );
    process.exit(1);
  }

  if (nvim) {
    spawnSync("nvim", [filePath], { stdio: "inherit" });
    return;
  }

  process.stdout.write(fs.readFileSync(filePath, "utf-8"));
}

export function promptListCommand(): void {
  const prompts = new Set<string>();

  // Workflow-specific agents (if in a workflow session)
  const workflow = getSessionWorkflow();
  if (workflow) {
    const agentsDir = path.join(WORKFLOWS_DIR, workflow, "agents");
    if (fs.existsSync(agentsDir)) {
      for (const f of fs.readdirSync(agentsDir)) {
        if (f.endsWith(".md")) {
          prompts.add(f.replace(/\.md$/, ""));
        }
      }
    }
  }

  // Global prompts
  if (fs.existsSync(AGENTS_DIR)) {
    for (const f of fs.readdirSync(AGENTS_DIR)) {
      if (f.endsWith(".md")) {
        prompts.add(f.replace(/\.md$/, ""));
      }
    }
  }

  if (prompts.size === 0) {
    console.log("No prompts found.");
    return;
  }

  console.log("Prompts:");
  for (const name of [...prompts].sort()) {
    console.log(`  ${name}`);
  }
}
