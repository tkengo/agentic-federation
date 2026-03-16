import fs from "node:fs";
import path from "node:path";
import { FED_HOME } from "../lib/paths.js";

const CONFIG_PATH = path.join(FED_HOME, "config.json");

export type FedConfig = Record<string, unknown>;

export function readConfig(): FedConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

function writeConfig(config: FedConfig): void {
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

  const value = getNestedValue(config, key);
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
  const config = readConfig();
  setNestedValue(config, key, value);
  writeConfig(config);
  console.log(`Set ${key} = ${value}`);
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
