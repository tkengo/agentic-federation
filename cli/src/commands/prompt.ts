import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { WORKFLOWS_DIR } from "../lib/paths.js";
import { getCurrentTmuxSession, resolveSession, readMeta } from "../lib/session.js";

/**
 * Resolve the path to a composed agent instruction file.
 * 1. Try composed file: <sessionDir>/agents/<name>.md
 * 2. Fall back to source: workflows/<workflow>/agents/<name>.md (backward compat)
 */
function resolvePromptPath(name: string): string | null {
  const tmuxSession = getCurrentTmuxSession();
  if (!tmuxSession) return null;

  const sessionDir = resolveSession(tmuxSession);
  if (!sessionDir) return null;

  const meta = readMeta(sessionDir);
  if (!meta) return null;

  // Try composed file in session directory
  const composedPath = path.join(sessionDir, "agents", `${name}.md`);
  if (fs.existsSync(composedPath)) return composedPath;

  // Fall back to source (for backward compatibility during migration)
  const workflow = meta.workflow;
  if (workflow) {
    const wfPath = path.join(WORKFLOWS_DIR, workflow, "agents", `${name}.md`);
    if (fs.existsSync(wfPath)) return wfPath;
  }

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
  const tmuxSession = getCurrentTmuxSession();

  if (tmuxSession) {
    const sessionDir = resolveSession(tmuxSession);
    if (sessionDir) {
      const meta = readMeta(sessionDir);
      if (meta) {
        // Try composed files in session directory
        const agentsDir = path.join(sessionDir, "agents");
        if (fs.existsSync(agentsDir)) {
          for (const f of fs.readdirSync(agentsDir)) {
            if (f.endsWith(".md")) {
              prompts.add(f.replace(/\.md$/, ""));
            }
          }
        }

        // Fall back to source agents (backward compatibility)
        if (prompts.size === 0 && meta.workflow) {
          const wfAgentsDir = path.join(WORKFLOWS_DIR, meta.workflow, "agents");
          if (fs.existsSync(wfAgentsDir)) {
            for (const f of fs.readdirSync(wfAgentsDir)) {
              if (f.endsWith(".md")) {
                prompts.add(f.replace(/\.md$/, ""));
              }
            }
          }
        }
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
