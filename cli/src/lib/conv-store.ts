import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readMeta } from "./session.js";
import { collectClaude } from "./collectors/claude.js";
import { collectCodex } from "./collectors/codex.js";
import { collectGemini } from "./collectors/gemini.js";

// ---------------------------------------------------------------------------
// Tool log paths
// ---------------------------------------------------------------------------
export const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
export const CODEX_DB_PATH = path.join(os.homedir(), ".codex", "state_5.sqlite");
export const CODEX_SESSIONS_DIR = path.join(os.homedir(), ".codex", "sessions");
export const GEMINI_TMP_DIR = path.join(os.homedir(), ".gemini", "tmp");

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** Metadata header – always the first line of each conversation JSONL file. */
export interface ConvMeta {
  type: "meta";
  tool: "claude" | "codex" | "gemini";
  session_id: string;
  pane: string;
  started_at: string;
  collected_at: string;
  turn_count: number;
  source_path: string;
}

/** A single conversation turn (user message or assistant message). */
export interface ConvTurn {
  tool: "claude" | "codex" | "gemini";
  session_id: string;
  timestamp: string;
  role: "user" | "assistant";
  content: string;
  tool_calls?: ConvToolCall[];
  metadata?: Record<string, unknown>;
}

/** A tool invocation within an assistant turn. */
export interface ConvToolCall {
  name: string;
  input?: string;
  output?: string;
}

/** Result returned by each collector. */
export interface CollectorResult {
  tool: "claude" | "codex" | "gemini";
  pane: string;
  sessionId: string;
  startedAt: string;
  sourcePath: string;
  turns: ConvTurn[];
}

// ---------------------------------------------------------------------------
// Max length for tool call input/output to keep file sizes reasonable
// ---------------------------------------------------------------------------
export const TOOL_IO_MAX_LENGTH = 2000;

export function truncate(text: string, maxLen: number = TOOL_IO_MAX_LENGTH): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + `... (truncated, ${text.length} chars total)`;
}

// ---------------------------------------------------------------------------
// Conversation directory helpers
// ---------------------------------------------------------------------------

export function conversationsDir(sessionDir: string): string {
  return path.join(sessionDir, "conversations");
}

/** Write a single collector result to a JSONL file. */
function writeConversationFile(convDir: string, result: CollectorResult): void {
  const filename = `${result.pane}_${result.tool}.jsonl`;
  const filePath = path.join(convDir, filename);

  const meta: ConvMeta = {
    type: "meta",
    tool: result.tool,
    session_id: result.sessionId,
    pane: result.pane,
    started_at: result.startedAt,
    collected_at: new Date().toISOString(),
    turn_count: result.turns.length,
    source_path: result.sourcePath,
  };

  const lines = [JSON.stringify(meta)];
  for (const turn of result.turns) {
    lines.push(JSON.stringify(turn));
  }
  fs.writeFileSync(filePath, lines.join("\n") + "\n");
  console.log(`    ${filename} (${result.turns.length} turns)`);
}

// ---------------------------------------------------------------------------
// Main orchestrator – called from `fed stop`
// ---------------------------------------------------------------------------

export function collectConversations(sessionDir: string): void {
  const meta = readMeta(sessionDir);
  if (!meta) {
    console.error("  Warning: No meta.json found, skipping conversation collection.");
    return;
  }

  const convDir = conversationsDir(sessionDir);
  fs.mkdirSync(convDir, { recursive: true });

  let totalFiles = 0;

  // Claude Code
  try {
    const results = collectClaude(sessionDir);
    for (const r of results) {
      writeConversationFile(convDir, r);
      totalFiles++;
    }
  } catch (err) {
    console.error(`  Warning: Claude conversation collection failed: ${err}`);
  }

  // Codex
  try {
    const results = collectCodex(sessionDir, meta);
    for (const r of results) {
      writeConversationFile(convDir, r);
      totalFiles++;
    }
  } catch (err) {
    console.error(`  Warning: Codex conversation collection failed: ${err}`);
  }

  // Gemini
  try {
    const results = collectGemini(sessionDir, meta);
    for (const r of results) {
      writeConversationFile(convDir, r);
      totalFiles++;
    }
  } catch (err) {
    console.error(`  Warning: Gemini conversation collection failed: ${err}`);
  }

  if (totalFiles === 0) {
    console.log("  No conversations found.");
  }
}
