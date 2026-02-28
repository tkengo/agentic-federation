import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { REPOS_DIR, DEFAULT_BASE_PATH } from "../lib/paths.js";
import { loadRepoConfig, listRepoConfigs, saveNewRepoConfig, parseCloneUrl } from "../lib/repo.js";
import type { NewRepoConfig } from "../lib/types.js";

export function repoAddCommand(cloneUrl: string, basePath?: string): void {
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
