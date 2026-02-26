import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import readline from "node:readline";
import { REPOS_DIR } from "../lib/paths.js";
import { loadRepoConfig, listRepoConfigs, saveRepoConfig } from "../lib/repo.js";
import type { RepoConfig } from "../lib/types.js";

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function repoAddCommand(name: string): Promise<void> {
  const configPath = path.join(REPOS_DIR, `${name}.json`);
  if (fs.existsSync(configPath)) {
    console.error(`Repository '${name}' already exists. Use 'fed repo edit ${name}' to modify.`);
    process.exit(1);
  }

  console.log(`Adding repository: ${name}`);
  const repoRoot = await prompt("  repo_root (absolute path to git repo): ");
  const worktreeBase = await prompt("  worktree_base (parent dir for worktrees): ");
  const setup = await prompt("  setup command (e.g. 'npm install'): ");
  const devServer = await prompt("  dev_server command (or empty for none): ");
  const symlinksRaw = await prompt("  symlinks (comma-separated, e.g. '.claude'): ");
  const copiesRaw = await prompt("  copies (comma-separated, e.g. '.env.local'): ");
  const cleanupPattern = await prompt("  cleanup_pattern (glob for Claude project dirs): ");

  const config: RepoConfig = {
    repo_root: repoRoot,
    worktree_base: worktreeBase,
    setup,
    dev_server: devServer || null,
    symlinks: symlinksRaw ? symlinksRaw.split(",").map((s) => s.trim()) : [],
    copies: copiesRaw ? copiesRaw.split(",").map((s) => s.trim()) : [],
    cleanup_pattern: cleanupPattern,
  };

  saveRepoConfig(name, config);
  console.log(`Saved: ${configPath}`);
}

export function repoListCommand(): void {
  const repos = listRepoConfigs();
  if (repos.length === 0) {
    console.log("No repositories defined. Use 'fed repo add <name>' to add one.");
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
