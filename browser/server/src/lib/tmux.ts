import { execSync } from "node:child_process";

// Information about a single tmux pane within a session. Used to let the
// browser choose which pane to deliver feedback to, rather than guessing.
export interface PaneInfo {
  // Globally-unique tmux pane id (e.g. "%5"). Used as the send-keys target so
  // it stays valid regardless of window/pane index changes.
  id: string;
  windowIndex: number;
  windowName: string;
  paneIndex: number;
  // Whether this pane is the active one in its window.
  active: boolean;
  // The foreground command currently running (e.g. "node", "nvim").
  command: string;
  title: string;
}

// Quote a tmux/shell argument for safety.
function quote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function tmux(args: string): string {
  return execSync(`tmux ${args}`, { encoding: "utf-8" }).trim();
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// List every pane in the given session. Returns [] if the session does not
// exist (e.g. it was stopped) so callers can render an empty selector.
export function listPanes(session: string): PaneInfo[] {
  const fields = [
    "#{pane_id}",
    "#{window_index}",
    "#{window_name}",
    "#{pane_index}",
    "#{pane_active}",
    "#{pane_current_command}",
    "#{pane_title}",
  ].join("\t");

  let out: string;
  try {
    out = tmux(`list-panes -s -t ${quote(`=${session}`)} -F ${quote(fields)}`);
  } catch {
    return [];
  }
  if (!out) return [];

  const panes: PaneInfo[] = [];
  for (const line of out.split("\n")) {
    const parts = line.split("\t");
    if (parts.length < 7) continue;
    panes.push({
      id: parts[0],
      windowIndex: Number(parts[1]),
      windowName: parts[2],
      paneIndex: Number(parts[3]),
      active: parts[4] === "1",
      command: parts[5],
      // Title is last; rejoin in case it contains a tab.
      title: parts.slice(6).join("\t"),
    });
  }
  return panes;
}

// Send a (possibly multi-line) prompt to an interactive CLI in a pane, then
// submit with Enter.
//
// We deliberately do NOT use `send-keys <text>`: a literal newline in the text
// is interpreted as a submit (Enter), so a multi-line message would be sent
// line-by-line — and tmux also mangles embedded whitespace. Instead we load
// the raw text into a tmux paste buffer and paste it in *bracketed paste* mode
// (-p). CLIs like claude / codex treat a bracketed paste as a single inserted
// block: newlines stay as input and nothing is submitted. A standalone Enter
// afterwards submits the whole message exactly once.
export async function sendPrompt(paneId: string, text: string, sleepMs = 800): Promise<void> {
  // Buffer name derived from the pane id so concurrent sends to different panes
  // do not collide; it is deleted on paste (-d) anyway.
  const bufName = `fed-fb-${paneId.replace(/[^a-zA-Z0-9]/g, "")}`;

  // 1) Load the raw text into a named buffer via stdin (no shell escaping needed).
  execSync(`tmux load-buffer -b ${quote(bufName)} -`, { input: text });

  // 2) Paste in bracketed-paste mode, deleting the buffer afterwards (-d).
  tmux(`paste-buffer -p -b ${quote(bufName)} -t ${quote(paneId)} -d`);

  // 3) Brief pause so the CLI finishes processing the paste before submit.
  if (sleepMs > 0) await sleep(sleepMs);

  // 4) Submit with a standalone Enter so it is interpreted as a key event.
  tmux(`send-keys -t ${quote(paneId)} Enter`);
}
