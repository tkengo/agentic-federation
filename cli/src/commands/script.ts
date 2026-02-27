import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { requireSessionDir, readMeta } from "../lib/session.js";
import { loadSessionWorkflow } from "../lib/workflow.js";
import type { ScriptDef } from "../lib/workflow.js";

function loadScripts(sessionDir: string): Record<string, ScriptDef> {
  const wf = loadSessionWorkflow(sessionDir);
  if (!wf) {
    console.error("Error: No workflow.yaml found in session directory.");
    process.exit(1);
  }
  return wf.scripts ?? {};
}

function resolveScriptPath(scriptDef: ScriptDef, sessionDir: string): string {
  const raw = scriptDef.path;
  if (path.isAbsolute(raw)) {
    return raw;
  }
  // Relative paths resolve from the repo worktree
  const meta = readMeta(sessionDir);
  if (meta?.worktree) {
    return path.resolve(meta.worktree, raw);
  }
  return path.resolve(sessionDir, raw);
}

function resolveCwd(scriptDef: ScriptDef, sessionDir: string): string {
  if (scriptDef.cwd === "session") {
    return sessionDir;
  }
  // Default to repo worktree
  const meta = readMeta(sessionDir);
  if (meta?.worktree) {
    return meta.worktree;
  }
  return sessionDir;
}

export function scriptListCommand(): void {
  const sessionDir = requireSessionDir();
  const scripts = loadScripts(sessionDir);
  const entries = Object.entries(scripts);

  console.log("Scripts:");
  if (entries.length === 0) {
    console.log("  (none)");
    return;
  }
  for (const [name, def] of entries) {
    const desc = def.description ? `  ${def.description}` : "";
    console.log(`  ${name.padEnd(24)}${desc}`);
  }
}

export function scriptShowCommand(name: string): void {
  const sessionDir = requireSessionDir();
  const scripts = loadScripts(sessionDir);
  const def = scripts[name];

  if (!def) {
    console.error(`Error: Script '${name}' not found.`);
    console.error(`Available scripts: ${Object.keys(scripts).join(", ") || "(none)"}`);
    process.exit(1);
  }

  const resolvedPath = resolveScriptPath(def, sessionDir);
  const cwd = resolveCwd(def, sessionDir);

  console.log(`Script: ${name}`);
  if (def.description) {
    console.log(`Description: ${def.description}`);
  }
  console.log(`Path: ${def.path}`);
  console.log(`Resolved: ${resolvedPath}`);
  console.log(`Cwd: ${cwd}`);
  if (def.env && Object.keys(def.env).length > 0) {
    console.log("Env:");
    for (const [k, v] of Object.entries(def.env)) {
      console.log(`  ${k}=${v}`);
    }
  }
}

export function scriptRunCommand(name: string): void {
  const sessionDir = requireSessionDir();
  const scripts = loadScripts(sessionDir);
  const def = scripts[name];

  if (!def) {
    console.error(`Error: Script '${name}' not found.`);
    console.error(`Available scripts: ${Object.keys(scripts).join(", ") || "(none)"}`);
    process.exit(1);
  }

  const resolvedPath = resolveScriptPath(def, sessionDir);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: Script file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const cwd = resolveCwd(def, sessionDir);
  const meta = readMeta(sessionDir);

  // Build environment: inherit current env, add script-defined env, add session context
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    FED_SESSION_DIR: sessionDir,
  };
  if (meta?.worktree) {
    env.FED_REPO_DIR = meta.worktree;
  }
  if (meta?.branch) {
    env.FED_BRANCH = meta.branch;
  }
  if (meta?.repo) {
    env.FED_REPO = meta.repo;
  }
  if (meta?.workflow) {
    env.FED_WORKFLOW = meta.workflow;
  }
  // Script-defined env overrides
  if (def.env) {
    for (const [k, v] of Object.entries(def.env)) {
      env[k] = v;
    }
  }

  console.error(`Running script: ${name} (${resolvedPath})`);
  const result = spawnSync(resolvedPath, {
    cwd,
    env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Error: Failed to execute script: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== null && result.status !== 0) {
    console.error(`Script '${name}' exited with code ${result.status}`);
    process.exit(result.status);
  }
}
