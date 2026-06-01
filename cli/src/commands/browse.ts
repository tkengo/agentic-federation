import path from "node:path";
import { spawn } from "node:child_process";
import { platform } from "node:os";

export interface BrowseOptions {
  port?: string;
  open?: boolean;
}

export function browseCommand(options: BrowseOptions): void {
  // cli/src/commands/browse.ts -> cli/ -> agentic-federation/ -> browser/server
  const serverDir = path.resolve(import.meta.dirname, "..", "..", "..", "browser", "server");
  const entryPoint = path.join(serverDir, "dist", "index.js");

  const port = options.port ?? process.env.FED_BROWSE_PORT ?? "7777";

  const child = spawn("node", [entryPoint], {
    stdio: "inherit",
    cwd: serverDir,
    env: { ...process.env, FED_BROWSE_PORT: port },
  });

  // Auto-open browser unless --no-open
  if (options.open !== false) {
    const url = `http://localhost:${port}`;
    setTimeout(() => {
      openBrowser(url);
    }, 500);
  }

  const shutdown = (): void => {
    child.kill("SIGTERM");
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

function openBrowser(url: string): void {
  const opener =
    platform() === "darwin"
      ? "open"
      : platform() === "win32"
        ? "start"
        : "xdg-open";
  spawn(opener, [url], { stdio: "ignore", detached: true }).unref();
}
