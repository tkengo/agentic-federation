import fs from "node:fs";
import path from "node:path";

const V3_NAME = "workflow-v3.yaml";
const V2_NAME = "workflow-v2.yaml";

/**
 * Find the workflow YAML file in a directory.
 * Prefers workflow-v3.yaml (engine-v3 sessions), falls back to workflow-v2.yaml.
 * Returns the absolute path, or null if neither exists.
 */
export function findWorkflowYaml(dir: string): string | null {
  const v3 = path.join(dir, V3_NAME);
  if (fs.existsSync(v3)) return v3;
  const v2 = path.join(dir, V2_NAME);
  if (fs.existsSync(v2)) return v2;
  return null;
}

/**
 * Resolve the engine version from a workflow's `engine` field.
 *
 * Semantics:
 *   "v2"                  -> v2 engine (legacy headless `claude -p` spawning)
 *   "v3" | true | undefined -> v3 engine (tmux-resident agents, default)
 *   false                 -> caller should check via isEngineEnabled first;
 *                            still returns "v3" here so the type stays clean
 *
 * v3 is the default. Pre-existing workflows that still need the v2 engine
 * must declare `engine: v2` explicitly.
 */
export function resolveEngineVersion(engine: boolean | "v2" | "v3" | undefined): "v2" | "v3" {
  return engine === "v2" ? "v2" : "v3";
}

/** Whether the workflow opts in to an engine process at all. */
export function isEngineEnabled(engine: boolean | "v2" | "v3" | undefined): boolean {
  return engine !== false;
}
