import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

export interface GitLink {
  // "pr": link to the file in an open PR's diff.
  // "branch": no PR — link to the file on its branch.
  // "none": could not resolve (no git remote / standalone session).
  kind: "pr" | "branch" | "none";
  url?: string;
}

function quote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

// Extract "owner/repo" from a git remote URL, tolerating SSH host aliases
// (git@alias:owner/repo.git) and https forms.
function ownerRepoFromRemote(remote: string): string | null {
  const m = remote.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

// Percent-encode each path segment but keep the slashes.
function encodePath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

// Resolve the GitHub web link for a repo-relative file: the open PR's diff if
// one exists for the branch, otherwise the file on its branch. Any gh failure
// (not installed, not authed, no PR) degrades gracefully to the branch link.
export function resolveGitLink(worktree: string, branch: string, relPath: string): GitLink {
  let remote: string;
  try {
    remote = execSync("git remote get-url origin", { cwd: worktree, encoding: "utf-8" }).trim();
  } catch {
    return { kind: "none" };
  }
  const ownerRepo = ownerRepoFromRemote(remote);
  if (!ownerRepo) return { kind: "none" };

  let prNumber: number | null = null;
  try {
    const out = execSync(
      `gh pr list --repo ${quote(ownerRepo)} --head ${quote(branch)} --json number --limit 1`,
      { cwd: worktree, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    const arr = JSON.parse(out) as Array<{ number: number }>;
    if (arr.length > 0) prNumber = arr[0].number;
  } catch {
    prNumber = null;
  }

  if (prNumber != null) {
    // GitHub anchors a file in the PR files view by the SHA-256 of its path.
    const anchor = createHash("sha256").update(relPath).digest("hex");
    return { kind: "pr", url: `https://github.com/${ownerRepo}/pull/${prNumber}/files#diff-${anchor}` };
  }
  return {
    kind: "branch",
    url: `https://github.com/${ownerRepo}/blob/${encodePath(branch)}/${encodePath(relPath)}`,
  };
}
