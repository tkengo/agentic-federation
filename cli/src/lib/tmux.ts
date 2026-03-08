import { execSync } from "node:child_process";

// Execute a tmux command and return stdout
export function tmux(args: string): string {
  return execSync(`tmux ${args}`, { encoding: "utf-8" }).trim();
}

// Check if a tmux session exists
export function hasSession(name: string): boolean {
  try {
    execSync(`tmux has-session -t ${quote(name)} 2>/dev/null`, {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

// Create a new detached tmux session
export function newSession(
  name: string,
  cwd: string,
  windowName: string = "dev"
): void {
  // Use 200x50 as default size (will be resized when attached)
  tmux(
    `new-session -s ${quote(name)} -d -x 200 -y 50 -c ${quote(cwd)} -n ${quote(windowName)}`
  );
}

// Create a new window in an existing session
export function newWindow(
  session: string,
  windowName: string,
  cwd: string
): void {
  tmux(
    `new-window -t ${quote(session)} -n ${quote(windowName)} -c ${quote(cwd)}`
  );
}

// Split a pane
export function splitWindow(
  target: string,
  direction: "h" | "v",
  percentage: number,
  cwd: string
): void {
  tmux(
    `split-window -${direction} -t ${quote(target)} -p ${percentage} -c ${quote(cwd)}`
  );
}

// Send keys to a pane
export function sendKeys(target: string, keys: string): void {
  tmux(`send-keys -t ${quote(target)} ${quote(keys)} Enter`);
}

// Select a pane
export function selectPane(target: string): void {
  tmux(`select-pane -t ${quote(target)}`);
}

// Select a window
export function selectWindow(target: string): void {
  tmux(`select-window -t ${quote(target)}`);
}

// Set an environment variable in a tmux session.
// New panes/windows created after this call inherit the variable.
export function setEnvironment(session: string, name: string, value: string): void {
  tmux(`set-environment -t ${quote(session)} ${quote(name)} ${quote(value)}`);
}

// Set a tmux option for a specific session
export function setOption(session: string, option: string, value: string): void {
  tmux(`set-option -t ${quote(session)} ${quote(option)} ${quote(value)}`);
}

// Quote a tmux argument for shell safety
function quote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
