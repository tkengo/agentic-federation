import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { REPOS_DIR, DEFAULT_BASE_PATH } from "../lib/paths.js";
import { loadRepoConfig, listRepoConfigs, saveNewRepoConfig, parseCloneUrl } from "../lib/repo.js";
import type { NewRepoConfig } from "../lib/types.js";

export function repoAddCommand(cloneUrl: string, basePath?: string, baseBranch?: string): void {
  const repoName = parseCloneUrl(cloneUrl);
  const configPath = path.join(REPOS_DIR, `${repoName}.json`);
  if (fs.existsSync(configPath)) {
    console.error(`Repository '${repoName}' already exists. Use 'fed repo edit ${repoName}' to modify.`);
    process.exit(1);
  }

  const resolvedBase = basePath ?? DEFAULT_BASE_PATH;
  const workspace = path.join(resolvedBase, `${repoName}-workspace`);
  const cloneDest = path.join(workspace, "main");

  console.log(`Adding repository: ${repoName}`);
  console.log(`  Clone URL:  ${cloneUrl}`);
  console.log(`  Base path:  ${resolvedBase}`);
  console.log(`  Workspace:  ${workspace}`);
  console.log(`  Clone dest: ${cloneDest}`);

  // Create workspace directory
  fs.mkdirSync(workspace, { recursive: true });

  // Clone the repo
  console.log(`\nCloning...`);
  execSync(`git clone '${cloneUrl}' '${cloneDest}'`, { stdio: "inherit" });

  // Save config in new format
  const config: NewRepoConfig = {
    repo_name: repoName,
    base_path: resolvedBase,
    ...(baseBranch ? { base_branch: baseBranch } : {}),
    setup_scripts: [],
    symlinks: [],
    copy_files: [],
    extra: {},
  };
  saveNewRepoConfig(repoName, config);
  console.log(`\nSaved: ${configPath}`);
}

export function repoAddLocalCommand(
  repoPath: string,
  basePath?: string,
  baseBranch?: string
): void {
  // Resolve repo path (expand ~/)
  const resolvedRepoPath = repoPath.startsWith("~/")
    ? path.join(os.homedir(), repoPath.slice(2))
    : path.resolve(repoPath);

  // Validate: path exists
  if (!fs.existsSync(resolvedRepoPath)) {
    console.error(`Error: path does not exist: ${resolvedRepoPath}`);
    process.exit(1);
  }

  // Validate: path is a git repository
  try {
    execSync(`git -C '${resolvedRepoPath}' rev-parse --git-dir`, {
      stdio: "ignore",
    });
  } catch {
    console.error(`Error: not a git repository: ${resolvedRepoPath}`);
    process.exit(1);
  }

  // Auto-detect repo name
  let repoName = "";

  // Try: git remote get-url origin → parseCloneUrl
  try {
    const remoteUrl = execSync(
      `git -C '${resolvedRepoPath}' remote get-url origin`,
      { encoding: "utf-8" }
    ).trim();
    if (remoteUrl) {
      repoName = parseCloneUrl(remoteUrl);
    }
  } catch {
    // No remote configured
  }

  // Fallback: directory basename (strip leading dot)
  if (!repoName) {
    repoName = path.basename(resolvedRepoPath).replace(/^\./, "");
  }

  if (!repoName) {
    console.error("Error: cannot determine repository name.");
    process.exit(1);
  }

  // Check for existing config
  const configPath = path.join(REPOS_DIR, `${repoName}.json`);
  if (fs.existsSync(configPath)) {
    console.error(`Repository '${repoName}' already exists. Use 'fed repo edit ${repoName}' to modify.`);
    process.exit(1);
  }

  const resolvedBase = basePath ?? DEFAULT_BASE_PATH;
  const workspace = path.join(resolvedBase, `${repoName}-workspace`);

  console.log(`Adding local repository: ${repoName}`);
  console.log(`  Repo root:     ${resolvedRepoPath}`);
  console.log(`  Base path:     ${resolvedBase}`);
  console.log(`  Worktree base: ${workspace}`);

  // Create workspace directory
  fs.mkdirSync(workspace, { recursive: true });

  // Save config with repo_root override
  const config: NewRepoConfig = {
    repo_name: repoName,
    base_path: resolvedBase,
    repo_root: resolvedRepoPath,
    ...(baseBranch ? { base_branch: baseBranch } : {}),
    setup_scripts: [],
    symlinks: [],
    copy_files: [],
    extra: {},
  };
  saveNewRepoConfig(repoName, config);
  console.log(`\nSaved: ${configPath}`);
}

export function repoListCommand(): void {
  const repos = listRepoConfigs();
  if (repos.length === 0) {
    console.log("No repositories defined. Use 'fed repo add <clone-url>' to add one.");
    return;
  }
  console.log("Repositories:");
  for (const name of repos) {
    const config = loadRepoConfig(name);
    console.log(`  ${name} - ${config.repo_root}`);
  }
}

export function repoShowCommand(name: string): void {
  const config = loadRepoConfig(name);
  console.log(JSON.stringify(config, null, 2));
}

export function repoEditCommand(name: string): void {
  const configPath = path.join(REPOS_DIR, `${name}.json`);
  if (!fs.existsSync(configPath)) {
    console.error(`Repository '${name}' not found.`);
    process.exit(1);
  }
  const editor = process.env.EDITOR || "vim";
  execSync(`${editor} ${configPath}`, { stdio: "inherit" });
}
