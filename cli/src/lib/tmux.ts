import { execSync } from "node:child_process";

// Execute a tmux command and return stdout
export function tmux(args: string): string {
  return execSync(`tmux ${args}`, { encoding: "utf-8" }).trim();
}

// Check if a tmux session exists
export function hasSession(name: string): boolean {
  try {
    execSync(`tmux has-session -t ${quote(`=${name}`)} 2>/dev/null`, {
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
    `new-window -t ${quote(`=${session}`)} -n ${quote(windowName)} -c ${quote(cwd)}`
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
    `split-window -${direction} -t ${quote(`=${target}`)} -p ${percentage} -c ${quote(cwd)}`
  );
}

// Send keys to a pane
export function sendKeys(target: string, keys: string): void {
  tmux(`send-keys -t ${quote(`=${target}`)} ${quote(keys)} Enter`);
}

// Wait until a freshly created pane's shell is ready to accept input.
//
// A brand-new shell may still be running its init (.zshrc / .bashrc,
// instant-prompt plugins, etc.); send-keys issued during that window can be
// dropped or garbled, which is why the engine occasionally failed to start.
// Instead of a blind fixed sleep, we send a marker `echo` and poll the pane
// until the marker is echoed back, proving the shell executed a command.
// This returns almost immediately on a warm machine and only waits as long as
// the shell actually needs (up to timeoutMs). It is also self-healing: if an
// early marker is dropped, a later one gets through.
export function waitForShellReady(target: string, timeoutMs: number = 8000): void {
  const q = quote(`=${target}`);
  const marker = "__FED_SHELL_READY__";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    tmux(`send-keys -t ${q} ${quote(`echo ${marker}`)} Enter`);
    execSync(`sleep 0.15`);
    const content = tmux(`capture-pane -p -t ${q}`);
    // The command line shows `echo __FED_SHELL_READY__`; the marker appearing
    // on its own line is the command's output, i.e. the shell ran it.
    if (content.split("\n").some((l) => l.trim() === marker)) {
      tmux(`send-keys -t ${q} C-l`); // Clear the marker noise before the engine UI starts.
      return;
    }
  }
}

// Send a prompt to an interactive CLI in a pane, then submit with Enter.
// Splitting the text and the Enter into two send-keys calls (with a brief
// pause between) prevents the receiving CLI from treating the trailing Enter
// as part of the pasted text. Used to dispatch prompts to long-running
// claude / codex sessions in engine-v3.
export function sendPrompt(target: string, text: string, sleepMs: number = 1000): void {
  // 1) Deliver the text without committing it.
  tmux(`send-keys -t ${quote(`=${target}`)} ${quote(text)}`);

  // 2) Brief pause so the CLI finishes processing the paste before submit.
  if (sleepMs > 0) {
    execSync(`sleep ${(sleepMs / 1000).toFixed(2)}`);
  }

  // 3) Submit with a standalone Enter so it is interpreted as a key event,
  //    not as part of the previous paste buffer.
  tmux(`send-keys -t ${quote(`=${target}`)} Enter`);
}

// Select a pane
export function selectPane(target: string): void {
  tmux(`select-pane -t ${quote(`=${target}`)}`);
}

// Select a window
export function selectWindow(target: string): void {
  tmux(`select-window -t ${quote(`=${target}`)}`);
}

// Set an environment variable in a tmux session.
// New panes/windows created after this call inherit the variable.
export function setEnvironment(session: string, name: string, value: string): void {
  tmux(`set-environment -t ${quote(`=${session}`)} ${quote(name)} ${quote(value)}`);
}

// Set a tmux option for a specific session
export function setOption(session: string, option: string, value: string): void {
  tmux(`set-option -t ${quote(session)} ${quote(option)} ${quote(value)}`);
}

// Quote a tmux argument for shell safety
function quote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
