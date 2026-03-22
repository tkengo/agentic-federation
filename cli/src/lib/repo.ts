import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPOS_DIR } from "./paths.js";
import type { RepoConfig, NewRepoConfig } from "./types.js";

// Extract repo name from SSH or HTTPS clone URL
export function parseCloneUrl(url: string): string {
  // SSH: git@github.com:user/repo.git
  const sshMatch = url.match(/[:\/]([^/]+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1]!;
  // Fallback: last path segment
  return path.basename(url, ".git");
}

// Derive normalized RepoConfig fields from new format
function deriveFromNewFormat(raw: NewRepoConfig): RepoConfig {
  const workspace = path.join(raw.base_path, `${raw.repo_name}-workspace`);
  return {
    repo_root: raw.repo_root ?? path.join(workspace, "main"),
    worktree_base: workspace,
    cleanup_pattern: `*${raw.repo_name}*`,
    base_branch: raw.base_branch ?? "origin/main",
    symlinks: raw.symlinks ?? [],
    setup_scripts: raw.setup_scripts ?? [],
    copy_files: raw.copy_files ?? [],
    extra: raw.extra ?? {},
    scripts: raw.scripts ?? {},
    env: raw.env ?? {},
    workflow_overrides: raw.workflow_overrides ?? {},
  };
}

// Load a repo config by name from ~/.fed/repos/<name>.json
export function loadRepoConfig(name: string): RepoConfig {
  const configPath = path.join(REPOS_DIR, `${name}.json`);
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Repository '${name}' not found. Run 'fed repo list' to see available repos.`
    );
  }
  const raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as NewRepoConfig;
  return deriveFromNewFormat(raw);
}

// List all repo config names
export function listRepoConfigs(): string[] {
  if (!fs.existsSync(REPOS_DIR)) {
    return [];
  }
  return fs
    .readdirSync(REPOS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

// Save a repo config in new format
export function saveNewRepoConfig(name: string, config: NewRepoConfig): void {
  fs.mkdirSync(REPOS_DIR, { recursive: true });
  const configPath = path.join(REPOS_DIR, `${name}.json`);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

// ---- Script path resolution ----

// Resolve script path: expand ~/, absolute as-is, relative from REPOS_DIR.
export function resolveRepoScriptPath(scriptPath: string): string {
  if (scriptPath.startsWith("~/")) {
    return path.join(os.homedir(), scriptPath.slice(2));
  }
  if (path.isAbsolute(scriptPath)) return scriptPath;
  return path.resolve(REPOS_DIR, scriptPath);
}
