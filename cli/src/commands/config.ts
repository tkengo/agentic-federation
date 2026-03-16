import fs from "node:fs";
import path from "node:path";
import { FED_HOME, KNOWLEDGE_DIR } from "../lib/paths.js";

const CONFIG_PATH = path.join(FED_HOME, "config.json");

/** Typed config structure. */
export interface FedConfig {
  files: {
    dir: string;
  };
}

/** Default values for all config keys. */
export const DEFAULT_CONFIG: FedConfig = {
  files: {
    dir: KNOWLEDGE_DIR,
  },
};

/** Description for each config key (dot-notation). */
const CONFIG_DESCRIPTIONS: Record<string, string> = {
  "files.dir": "Knowledge base file storage directory",
};

/** Read config from disk and merge with defaults. */
export function readConfig(): FedConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    return structuredClone(DEFAULT_CONFIG);
  }
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as Record<string, unknown>;
  const base = structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>;
  return deepMerge(base, raw) as unknown as FedConfig;
}

/** Read raw config from disk without merging defaults. */
function readRawConfig(): Record<string, unknown> {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

function writeConfig(config: Record<string, unknown>): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Get a config value by dot-separated key, or print all config.
 */
export function configGetCommand(key?: string): void {
  const config = readConfig();

  if (!key) {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  const value = getNestedValue(config as unknown as Record<string, unknown>, key);
  if (value === undefined) {
    console.error(`Error: Key '${key}' is not set.`);
    process.exit(1);
  }

  if (typeof value === "object") {
    console.log(JSON.stringify(value, null, 2));
  } else {
    console.log(String(value));
  }
}

/**
 * Set a config value by dot-separated key.
 */
export function configSetCommand(key: string, value: string): void {
  const raw = readRawConfig();
  setNestedValue(raw, key, value);
  writeConfig(raw);
  console.log(`Set ${key} = ${value}`);
}

/**
 * Show all config keys with current values and defaults in table format.
 */
export function configShowCommand(): void {
  const config = readConfig();
  const flat = flattenObject(config as unknown as Record<string, unknown>);
  const defaultFlat = flattenObject(DEFAULT_CONFIG as unknown as Record<string, unknown>);

  const rows = Object.keys(defaultFlat).map((key) => ({
    key,
    value: flat[key] !== undefined ? String(flat[key]) : String(defaultFlat[key]),
    default: String(defaultFlat[key]),
  }));

  const headers = { key: "Key", value: "Value", default: "Default" };
  const keyW = Math.max(headers.key.length, ...rows.map((r) => r.key.length));
  const valW = Math.max(headers.value.length, ...rows.map((r) => r.value.length));
  const defW = Math.max(headers.default.length, ...rows.map((r) => r.default.length));

  console.log(
    `${headers.key.padEnd(keyW)}  ${headers.value.padEnd(valW)}  ${headers.default}`,
  );
  console.log(
    `${"─".repeat(keyW)}  ${"─".repeat(valW)}  ${"─".repeat(defW)}`,
  );

  for (const row of rows) {
    console.log(
      `${row.key.padEnd(keyW)}  ${row.value.padEnd(valW)}  ${row.default}`,
    );
  }
}

/** Flatten a nested object into dot-notation keys with leaf values. */
function flattenObject(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(result, flattenObject(v as Record<string, unknown>, key));
    } else {
      result[key] = v;
    }
  }
  return result;
}

/** Deep merge source into target (target is mutated). */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  for (const [k, v] of Object.entries(source)) {
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      target[k] !== null &&
      typeof target[k] === "object" &&
      !Array.isArray(target[k])
    ) {
      deepMerge(
        target[k] as Record<string, unknown>,
        v as Record<string, unknown>,
      );
    } else {
      target[k] = v;
    }
  }
  return target;
}

function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setNestedValue(
  obj: Record<string, unknown>,
  key: string,
  value: string,
): void {
  const parts = key.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (
      current[part] === undefined ||
      current[part] === null ||
      typeof current[part] !== "object"
    ) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}
