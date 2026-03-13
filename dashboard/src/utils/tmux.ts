import { execSync } from "node:child_process";

/**
 * List all active tmux session names.
 * Returns a Set of session name strings.
 */
export function listTmuxSessions(): Set<string> {
  try {
    const output = execSync("tmux list-sessions -F '#S'", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return new Set(output.trim().split("\n").filter(Boolean));
  } catch {
    return new Set();
  }
}

/**
 * Create a tmux session for a repo if it doesn't exist, then attach to it.
 * Session name: __repo_<repoName>
 * Returns true on success, false on failure.
 */
export function createOrAttachRepoSession(repoName: string, cwd: string): boolean {
  const sessionName = `__repo_${repoName}`;
  try {
    // Check if session already exists
    let exists = false;
    try {
      execSync(`tmux has-session -t '=${sessionName}'`, { stdio: "ignore" });
      exists = true;
    } catch {
      // Session does not exist
    }

    if (!exists) {
      execSync(`tmux new-session -d -s '${sessionName}' -c '${cwd}'`, { stdio: "ignore" });
    }

    return switchToTmuxSession(sessionName);
  } catch {
    return false;
  }
}

// Shell-quote a string for safe embedding in tmux/shell commands
function q(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Build a deterministic tmux session name for an artifact.
 * Format: <parentSession>__art__<sanitizedArtifactName>
 */
export function artifactSessionName(parentSession: string, artifactName: string): string {
  // tmux session names cannot contain '.' or ':'
  const sanitized = artifactName.replace(/[.:]/g, "_");
  return `${parentSession}__art__${sanitized}`;
}

/**
 * Create or attach to a tmux session for viewing an artifact.
 * Layout: vertical split, left = nvim <artifactPath>, right = nvim (in worktree cwd).
 * If the session already exists, just attach to it.
 */
export function createOrAttachArtifactSession(
  parentSession: string,
  artifactPath: string,
  artifactName: string,
  worktreePath: string,
): boolean {
  const sessionName = artifactSessionName(parentSession, artifactName);
  try {
    let exists = false;
    try {
      execSync(`tmux has-session -t ${q(`=${sessionName}`)}`, { stdio: "ignore" });
      exists = true;
    } catch {
      // Session does not exist
    }

    if (!exists) {
      const artifactDir = artifactPath.substring(0, artifactPath.lastIndexOf("/"));
      // Create session with left pane in artifact directory
      execSync(
        `tmux new-session -d -s ${q(sessionName)} -c ${q(artifactDir)} -x 200 -y 50`,
        { stdio: "ignore" },
      );
      // Open nvim with the artifact in the first pane
      execSync(
        `tmux send-keys -t ${q(`=${sessionName}`)} ${q(`nvim ${q(artifactPath)}`)} Enter`,
        { stdio: "ignore" },
      );
      // Split horizontally (side-by-side), right pane in worktree dir
      execSync(
        `tmux split-window -h -t ${q(`=${sessionName}`)} -c ${q(worktreePath)} -p 50`,
        { stdio: "ignore" },
      );
      // Open nvim in the right pane
      execSync(
        `tmux send-keys -t ${q(`=${sessionName}`)} nvim Enter`,
        { stdio: "ignore" },
      );
      // Select left pane so user starts on the artifact
      // Use -L (left of active pane) instead of hardcoded pane index
      // to work regardless of pane-base-index setting
      execSync(
        `tmux select-pane -t ${q(`=${sessionName}`)} -L`,
        { stdio: "ignore" },
      );
    }

    return switchToTmuxSession(sessionName);
  } catch {
    return false;
  }
}

/**
 * Switch to (or attach to) a tmux session.
 * Inside tmux: uses display-popup so detaching returns to the caller.
 * Outside tmux: uses attach-session with stdio inherited.
 * Returns true on success, false on failure.
 */
export function switchToTmuxSession(target: string): boolean {
  const insideTmux = !!process.env.TMUX;
  try {
    if (insideTmux) {
      execSync(
        `tmux display-popup -E -w 100% -h 100% "TMUX= exec tmux attach-session -t '=${target}'"`,
        { stdio: "ignore" },
      );
    } else {
      execSync(`tmux attach-session -t '=${target}'`, { stdio: "inherit" });
      if (process.stdin.isTTY && process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
      }
      process.stdout.write("\x1b[2J\x1b[H");
    }
    return true;
  } catch {
    return false;
  }
}
