import fs from "node:fs";
import path from "node:path";
import { REPOS_DIR } from "./paths.js";
import type { RepoConfig } from "./types.js";

// Load a repo config by name from ~/.fed/repos/<name>.json
export function loadRepoConfig(name: string): RepoConfig {
  const configPath = path.join(REPOS_DIR, `${name}.json`);
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Repository '${name}' not found. Run 'fed repo list' to see available repos.`
    );
  }
  return JSON.parse(fs.readFileSync(configPath, "utf-8")) as RepoConfig;
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

// Save a repo config
export function saveRepoConfig(name: string, config: RepoConfig): void {
  fs.mkdirSync(REPOS_DIR, { recursive: true });
  const configPath = path.join(REPOS_DIR, `${name}.json`);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}
