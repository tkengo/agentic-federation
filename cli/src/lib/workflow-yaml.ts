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
