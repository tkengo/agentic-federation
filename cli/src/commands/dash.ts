import path from "node:path";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { platform } from "node:os";

export interface DashOptions {
  browse?: boolean;
  port?: string;
}

export function dashCommand(options: DashOptions = {}): void {
  // Resolve the dashboard entry point relative to this file
  // cli/src/commands/dash.ts -> cli/ -> agentic-federation/ -> dashboard/
  const dashboardDir = path.resolve(import.meta.dirname, "..", "..", "..", "dashboard");
  const entryPoint = path.join(dashboardDir, "dist", "index.js");

  let browseChild: ChildProcess | null = null;

  if (options.browse !== false) {
    const serverDir = path.resolve(import.meta.dirname, "..", "..", "..", "browser", "server");
    const serverEntry = path.join(serverDir, "dist", "index.js");
    const port = options.port ?? process.env.FED_BROWSE_PORT ?? "7777";

    browseChild = spawn("node", [serverEntry], {
      stdio: "ignore",
      cwd: serverDir,
      detached: false,
      env: { ...process.env, FED_BROWSE_PORT: port },
    });
    browseChild.on("error", () => {
      // Spawn errors (e.g. ENOENT) are silenced so the dashboard remains usable.
    });

    setTimeout(() => {
      if (!browseChild || browseChild.killed) return;
      const opener =
        platform() === "darwin"
          ? "open"
          : platform() === "win32"
            ? "start"
            : "xdg-open";
      spawn(opener, [`http://localhost:${port}`], {
        stdio: "ignore",
        detached: true,
      }).unref();
    }, 500);
  }

  try {
    execSync(`node '${entryPoint}'`, {
      stdio: "inherit",
      cwd: dashboardDir,
      env: { ...process.env, FORCE_COLOR: "3" },
    });
  } catch {
    // Normal exit (user pressed q) also throws, so just exit silently
  } finally {
    if (browseChild && !browseChild.killed) {
      browseChild.kill("SIGTERM");
    }
  }
}
