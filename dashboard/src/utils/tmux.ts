import { execSync } from "node:child_process";

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
