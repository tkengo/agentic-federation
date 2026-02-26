import path from "node:path";
import { execSync } from "node:child_process";

export function dashCommand(): void {
  // Resolve the dashboard entry point relative to this file
  // cli/src/commands/dash.ts -> cli/ -> agentic-federation/ -> dashboard/
  const dashboardDir = path.resolve(import.meta.dirname, "..", "..", "..", "dashboard");
  const entryPoint = path.join(dashboardDir, "dist", "index.js");

  try {
    execSync(`node '${entryPoint}'`, {
      stdio: "inherit",
      cwd: dashboardDir,
    });
  } catch {
    // Normal exit (user pressed q) also throws, so just exit silently
  }
}
