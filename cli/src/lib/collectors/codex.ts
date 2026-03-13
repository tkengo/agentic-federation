import fs from "node:fs";
import Database from "better-sqlite3";
import { CODEX_DB_PATH, truncate } from "../conv-store.js";
import type { CollectorResult, ConvTurn } from "../conv-store.js";
import type { MetaJson } from "../types.js";

// ---------------------------------------------------------------------------
// Codex rollout JSONL line types (subset we care about)
// ---------------------------------------------------------------------------

// Codex rollout JSONL structures are parsed dynamically from the payload
// fields (type, role, name, call_id, arguments, output, message).
// No static interfaces needed since we type-narrow via payload.type checks.

// ---------------------------------------------------------------------------
// SQLite thread row
// ---------------------------------------------------------------------------

interface ThreadRow {
  id: string;
  rollout_path: string;
  created_at: number;
  cwd: string;
  cli_version: string;
  first_user_message: string | null;
}

// ---------------------------------------------------------------------------
// Find Codex sessions matching a fed session
// ---------------------------------------------------------------------------

function findCodexSessions(meta: MetaJson): ThreadRow[] {
  if (!fs.existsSync(CODEX_DB_PATH)) return [];

  const db = new Database(CODEX_DB_PATH, { readonly: true });
  try {
    // Match by cwd (worktree path) and created_at >= session start
    const sessionStart = Math.floor(new Date(meta.created_at).getTime() / 1000);
    const worktree = meta.worktree;
    if (!worktree) return [];

    const rows = db
      .prepare(
        "SELECT id, rollout_path, created_at, cwd, cli_version, first_user_message " +
        "FROM threads WHERE cwd = ? AND created_at >= ? ORDER BY created_at ASC"
      )
      .all(worktree, sessionStart) as ThreadRow[];

    return rows;
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Parse a Codex rollout JSONL into ConvTurn[]
// ---------------------------------------------------------------------------

function parseRollout(filePath: string, sessionId: string): ConvTurn[] {
  if (!fs.existsSync(filePath)) return [];

  const raw = fs.readFileSync(filePath, "utf-8").trim();
  if (!raw) return [];

  const turns: ConvTurn[] = [];

  // Track pending function calls to pair with their outputs
  const pendingCalls = new Map<string, { name: string; input: string }>();

  for (const line of raw.split("\n")) {
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const entryType = entry.type as string;
    const payload = entry.payload as Record<string, unknown> | undefined;
    if (!payload) continue;
    const payloadType = payload.type as string | undefined;
    const timestamp = entry.timestamp as string;

    // User message (from event_msg – this is the concise user text)
    if (entryType === "event_msg" && payloadType === "user_message") {
      const message = payload.message as string | undefined;
      if (!message) continue;
      turns.push({
        tool: "codex",
        session_id: sessionId,
        timestamp,
        role: "user",
        content: message,
      });
      continue;
    }

    // Agent message (from event_msg – concise assistant text)
    if (entryType === "event_msg" && payloadType === "agent_message") {
      const message = payload.message as string | undefined;
      if (!message) continue;

      turns.push({
        tool: "codex",
        session_id: sessionId,
        timestamp,
        role: "assistant",
        content: message,
      });
      continue;
    }

    // Function call (tool invocation by assistant)
    if (entryType === "response_item" && payloadType === "function_call") {
      const callId = payload.call_id as string;
      const name = payload.name as string;
      const args = payload.arguments as string;
      pendingCalls.set(callId, {
        name,
        input: truncate(args),
      });
      continue;
    }

    // Function call output (tool result)
    if (entryType === "response_item" && payloadType === "function_call_output") {
      const callId = payload.call_id as string;
      const output = payload.output as string;
      const pending = pendingCalls.get(callId);
      if (pending) {
        // Emit as an assistant turn with the tool call
        turns.push({
          tool: "codex",
          session_id: sessionId,
          timestamp,
          role: "assistant",
          content: "",
          tool_calls: [{
            name: pending.name,
            input: pending.input,
            output: truncate(output),
          }],
        });
        pendingCalls.delete(callId);
      }
      continue;
    }

    // Skip: session_meta, reasoning, turn_context, token_count, developer messages
  }

  return turns;
}

// ---------------------------------------------------------------------------
// Public collector
// ---------------------------------------------------------------------------

/**
 * Collect Codex conversations for a fed session.
 *
 * Queries ~/.codex/state_5.sqlite to find threads whose cwd matches the
 * session worktree and were created after the session start time.
 */
export function collectCodex(sessionDir: string, meta: MetaJson): CollectorResult[] {
  const threads = findCodexSessions(meta);
  if (threads.length === 0) return [];

  const results: CollectorResult[] = [];

  for (let i = 0; i < threads.length; i++) {
    const thread = threads[i];
    if (!fs.existsSync(thread.rollout_path)) {
      console.error(`    Warning: Codex rollout file not found: ${thread.rollout_path}`);
      continue;
    }

    const turns = parseRollout(thread.rollout_path, thread.id);
    if (turns.length === 0) continue;

    // Use index-based pane naming since Codex doesn't track tmux panes
    const pane = `codex-${i}`;

    results.push({
      tool: "codex",
      pane,
      sessionId: thread.id,
      startedAt: new Date(thread.created_at * 1000).toISOString(),
      sourcePath: thread.rollout_path,
      turns,
    });
  }

  return results;
}
