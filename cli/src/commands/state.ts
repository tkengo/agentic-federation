import fs from "node:fs";
import path from "node:path";
import { requireSessionDir } from "../lib/session.js";
import type { StateJson } from "../lib/types.js";
import { loadSessionWorkflow } from "../lib/workflow.js";

// Get a nested value from an object by dot-separated path
function getNestedValue(obj: Record<string, unknown>, keyPath: string): unknown {
  const keys = keyPath.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

// Set a nested value on an object by dot-separated path
function setNestedValue(
  obj: Record<string, unknown>,
  keyPath: string,
  value: unknown
): void {
  const keys = keyPath.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (typeof current[key] !== "object" || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

// Try to parse a string value into its natural type
function parseValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  const num = Number(raw);
  if (!isNaN(num) && raw !== "") return num;
  return raw;
}

export function stateReadCommand(field?: string): void {
  const sessionDir = requireSessionDir();
  const statePath = path.join(sessionDir, "state.json");

  if (!fs.existsSync(statePath)) {
    console.error("Error: state.json not found in session directory.");
    process.exit(1);
  }

  const state = JSON.parse(fs.readFileSync(statePath, "utf-8")) as StateJson;

  if (!field) {
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  const value = getNestedValue(state as unknown as Record<string, unknown>, field);
  if (value === undefined) {
    console.error(`Error: Field '${field}' not found in state.json.`);
    process.exit(1);
  }

  if (typeof value === "object") {
    console.log(JSON.stringify(value, null, 2));
  } else {
    console.log(String(value));
  }
}

export function stateUpdateCommand(
  field: string,
  value: string,
  force: boolean = false
): void {
  const sessionDir = requireSessionDir();
  const statePath = path.join(sessionDir, "state.json");

  if (!fs.existsSync(statePath)) {
    console.error("Error: state.json not found in session directory.");
    process.exit(1);
  }

  const state = JSON.parse(fs.readFileSync(statePath, "utf-8")) as Record<string, unknown>;
  const parsed = parseValue(value);

  // Validate status transitions against workflow definition
  if (field === "status" && typeof parsed === "string") {
    const wf = loadSessionWorkflow(sessionDir);
    if (wf) {
      const currentStatus = state.status as string;
      const targetStatus = parsed;
      const currentState = wf.states[currentStatus];
      if (currentState) {
        const allowed = currentState.transitions;
        if (!allowed.includes(targetStatus)) {
          if (force) {
            console.error(
              `Warning: "${targetStatus}" is not a valid transition from "${currentStatus}". Forced.`
            );
          } else {
            console.error(
              `Error: "${targetStatus}" is not a valid transition from "${currentStatus}".`
            );
            console.error(`  Allowed transitions: ${allowed.join(", ")}`);
            console.error(`  Use --force to override.`);
            process.exit(1);
          }
        }
      }


    }
  }

  setNestedValue(state, field, parsed);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");

  // Append to history.jsonl
  const historyPath = path.join(sessionDir, "history.jsonl");
  const entry = {
    ts: new Date().toISOString(),
    event: "state_update",
    field,
    value: parsed,
  };
  fs.appendFileSync(historyPath, JSON.stringify(entry) + "\n");

  console.log(`Updated: ${field} = ${JSON.stringify(parsed)}`);
}
