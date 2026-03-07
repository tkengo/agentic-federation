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
      execSync(`tmux has-session -t '${sessionName}'`, { stdio: "ignore" });
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
        `tmux display-popup -E -w 100% -h 100% "TMUX= exec tmux attach-session -t '${target}'"`,
        { stdio: "ignore" },
      );
    } else {
      execSync(`tmux attach-session -t '${target}'`, { stdio: "inherit" });
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
