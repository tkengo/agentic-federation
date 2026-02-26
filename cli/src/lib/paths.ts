import path from "node:path";
import os from "node:os";

export const FED_HOME = path.join(os.homedir(), ".fed");
export const REPOS_DIR = path.join(FED_HOME, "repos");
export const SESSIONS_DIR = path.join(FED_HOME, "sessions");
export const ACTIVE_DIR = path.join(FED_HOME, "active");
export const ARCHIVE_DIR = path.join(FED_HOME, "archive");
export const KNOWLEDGE_DIR = path.join(FED_HOME, "knowledge");

// Prompts directory in the agentic-federation repo
export const PROMPTS_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "prompts"
);

export const ALL_DIRS = [
  FED_HOME,
  REPOS_DIR,
  SESSIONS_DIR,
  ACTIVE_DIR,
  ARCHIVE_DIR,
  KNOWLEDGE_DIR,
];
