import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { REPOS_DIR, SESSIONS_DIR, ARCHIVE_DIR, DEFAULT_BASE_PATH } from "../lib/paths.js";
import { loadRepoConfig, listRepoConfigs, saveNewRepoConfig, parseCloneUrl } from "../lib/repo.js";
import { findActiveSessionsByRepo } from "../lib/session.js";
import { confirm } from "../lib/prompt.js";
import type { NewRepoConfig, MetaJson } from "../lib/types.js";

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

  // Detect base branch if not explicitly specified
  // Stored as "origin/<branch>" by default for remote-tracking worktree creation
  let detectedBranch = baseBranch;
  if (!detectedBranch) {
    try {
      const ref = execSync(
        `git -C '${resolvedRepoPath}' symbolic-ref refs/remotes/origin/HEAD`,
        { encoding: "utf-8" }
      ).trim();
      // refs/remotes/origin/main -> origin/main
      detectedBranch = ref.replace(/^refs\/remotes\//, "");
    } catch {
      // Fallback: current HEAD branch name with origin/ prefix
      try {
        const branchName = execSync(
          `git -C '${resolvedRepoPath}' rev-parse --abbrev-ref HEAD`,
          { encoding: "utf-8" }
        ).trim();
        detectedBranch = `origin/${branchName}`;
      } catch {
        detectedBranch = "origin/main";
      }
    }
  }

  const resolvedBase = basePath ?? DEFAULT_BASE_PATH;
  const workspace = path.join(resolvedBase, `${repoName}-workspace`);

  console.log(`Adding local repository: ${repoName}`);
  console.log(`  Repo root:     ${resolvedRepoPath}`);
  console.log(`  Base branch:   ${detectedBranch}`);
  console.log(`  Base path:     ${resolvedBase}`);
  console.log(`  Worktree base: ${workspace}`);

  // Create workspace directory
  fs.mkdirSync(workspace, { recursive: true });

  // Save config with repo_root override
  const config: NewRepoConfig = {
    repo_name: repoName,
    base_path: resolvedBase,
    repo_root: resolvedRepoPath,
    base_branch: detectedBranch,
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

export async function repoDeleteCommand(name: string, force: boolean): Promise<void> {
  // Check config exists
  const configPath = path.join(REPOS_DIR, `${name}.json`);
  if (!fs.existsSync(configPath)) {
    console.error(`Repository '${name}' not found.`);
    process.exit(1);
  }

  // Check active sessions
  const activeSessions = findActiveSessionsByRepo(name);
  if (activeSessions.length > 0) {
    console.error(`Cannot delete '${name}': ${activeSessions.length} active session(s):`);
    for (const s of activeSessions) {
      console.error(`  - ${s.tmux_session} (${s.branch})`);
    }
    process.exit(1);
  }

  // Load config to get workspace path
  const config = loadRepoConfig(name);

  // Confirmation prompt
  if (!force) {
    console.log("This will delete:");
    console.log(`  Config:    ${configPath}`);
    if (fs.existsSync(config.worktree_base)) {
      console.log(`  Workspace: ${config.worktree_base}`);
    }
    const ok = await confirm(`Delete repository '${name}'?`);
    if (!ok) {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  // Delete config file
  fs.unlinkSync(configPath);
  console.log(`Deleted: ${configPath}`);

  // Delete workspace directory
  if (fs.existsSync(config.worktree_base)) {
    fs.rmSync(config.worktree_base, { recursive: true, force: true });
    console.log(`Deleted: ${config.worktree_base}`);
  }

  console.log(`Repository '${name}' deleted.`);
}

// Update meta.json files and rename a repo subdirectory under parentDir
function renameDirAndUpdateMeta(
  parentDir: string,
  oldName: string,
  newName: string,
  oldWorkspace: string,
  newWorkspace: string,
): void {
  const oldDir = path.join(parentDir, oldName);
  const newDir = path.join(parentDir, newName);

  if (!fs.existsSync(oldDir)) return;

  // Update meta.json in each session subdirectory
  for (const entry of fs.readdirSync(oldDir)) {
    const metaPath = path.join(oldDir, entry, "meta.json");
    if (!fs.existsSync(metaPath)) continue;

    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as MetaJson;
    meta.repo = newName;
    if (meta.session_dir) {
      meta.session_dir = meta.session_dir.replace(
        path.join(parentDir, oldName),
        path.join(parentDir, newName),
      );
    }
    if (meta.worktree) {
      meta.worktree = meta.worktree.replace(oldWorkspace, newWorkspace);
    }
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
  }

  // Rename the directory (merge if newDir already exists)
  if (fs.existsSync(newDir)) {
    for (const entry of fs.readdirSync(oldDir)) {
      fs.renameSync(path.join(oldDir, entry), path.join(newDir, entry));
    }
    fs.rmdirSync(oldDir);
  } else {
    fs.renameSync(oldDir, newDir);
  }
}

export function repoRenameCommand(oldName: string, newName: string): void {
  // Validate old config exists
  const oldConfigPath = path.join(REPOS_DIR, `${oldName}.json`);
  if (!fs.existsSync(oldConfigPath)) {
    console.error(`Repository '${oldName}' not found.`);
    process.exit(1);
  }

  // Validate new name doesn't conflict
  const newConfigPath = path.join(REPOS_DIR, `${newName}.json`);
  if (fs.existsSync(newConfigPath)) {
    console.error(`Repository '${newName}' already exists.`);
    process.exit(1);
  }

  // Check active sessions
  const activeSessions = findActiveSessionsByRepo(oldName);
  if (activeSessions.length > 0) {
    console.error(`Cannot rename '${oldName}': ${activeSessions.length} active session(s):`);
    for (const s of activeSessions) {
      console.error(`  - ${s.tmux_session} (${s.branch})`);
    }
    process.exit(1);
  }

  // Load raw config
  const raw = JSON.parse(fs.readFileSync(oldConfigPath, "utf-8")) as NewRepoConfig;
  const oldWorkspace = path.join(raw.base_path, `${oldName}-workspace`);
  const newWorkspace = path.join(raw.base_path, `${newName}-workspace`);

  // Rename config file + update repo_name
  raw.repo_name = newName;
  fs.writeFileSync(newConfigPath, JSON.stringify(raw, null, 2) + "\n");
  fs.unlinkSync(oldConfigPath);
  console.log(`Renamed config: ${oldName}.json -> ${newName}.json`);

  // Rename workspace directory
  if (fs.existsSync(oldWorkspace)) {
    fs.renameSync(oldWorkspace, newWorkspace);
    console.log(`Renamed workspace: ${oldWorkspace} -> ${newWorkspace}`);
  }

  // Rename session directory + update meta.json files
  renameDirAndUpdateMeta(SESSIONS_DIR, oldName, newName, oldWorkspace, newWorkspace);

  // Rename archive directory + update meta.json files
  renameDirAndUpdateMeta(ARCHIVE_DIR, oldName, newName, oldWorkspace, newWorkspace);

  console.log(`Repository renamed: ${oldName} -> ${newName}`);
}
