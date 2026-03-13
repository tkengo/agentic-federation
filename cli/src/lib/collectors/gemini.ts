import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { GEMINI_TMP_DIR, truncate } from "../conv-store.js";
import type { CollectorResult, ConvTurn, ConvToolCall } from "../conv-store.js";
import type { MetaJson } from "../types.js";

// ---------------------------------------------------------------------------
// Gemini session JSON types (subset we care about)
// ---------------------------------------------------------------------------

interface GeminiSession {
  sessionId: string;
  projectHash: string;
  startTime: string;
  lastUpdated: string;
  messages: GeminiMessage[];
}

interface GeminiMessage {
  id: string;
  timestamp: string;
  type: "user" | "gemini" | "info" | "error" | "warning";
  content: Array<{ text?: string }>;
  toolCalls?: GeminiToolCall[];
  tokens?: {
    input?: number;
    output?: number;
    cached?: number;
    total?: number;
  };
  model?: string;
}

interface GeminiToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  status: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Project hash computation
// ---------------------------------------------------------------------------

/**
 * Gemini CLI uses SHA-256 of the project root path to create the project hash
 * directory name.  We replicate this to find the right directory.
 */
function computeProjectHash(projectRoot: string): string {
  return crypto.createHash("sha256").update(projectRoot).digest("hex");
}

// ---------------------------------------------------------------------------
// Find Gemini sessions matching a fed session
// ---------------------------------------------------------------------------

function findGeminiSessions(meta: MetaJson): Array<{ filePath: string; session: GeminiSession }> {
  if (!fs.existsSync(GEMINI_TMP_DIR)) return [];
  if (!meta.worktree) return [];

  const sessionStart = new Date(meta.created_at).getTime();
  const results: Array<{ filePath: string; session: GeminiSession }> = [];

  // Strategy 1: Try exact project hash match
  const hash = computeProjectHash(meta.worktree);
  const hashDir = path.join(GEMINI_TMP_DIR, hash, "chats");
  const dirsToSearch: string[] = [];

  if (fs.existsSync(hashDir)) {
    dirsToSearch.push(hashDir);
  }

  // Strategy 2: If hash doesn't match, scan all directories and match by
  // session start time (Gemini may hash paths differently)
  if (dirsToSearch.length === 0) {
    for (const dir of fs.readdirSync(GEMINI_TMP_DIR)) {
      const chatsDir = path.join(GEMINI_TMP_DIR, dir, "chats");
      if (fs.existsSync(chatsDir)) {
        dirsToSearch.push(chatsDir);
      }
    }
  }

  for (const chatsDir of dirsToSearch) {
    for (const file of fs.readdirSync(chatsDir)) {
      if (!file.endsWith(".json")) continue;

      const filePath = path.join(chatsDir, file);
      let session: GeminiSession;
      try {
        session = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      } catch {
        continue;
      }

      // Filter by start time: session must have started after fed session creation
      const sessionStartTime = new Date(session.startTime).getTime();
      if (sessionStartTime < sessionStart) continue;

      // Must have messages
      if (!session.messages || session.messages.length === 0) continue;

      results.push({ filePath, session });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Parse a Gemini session into ConvTurn[]
// ---------------------------------------------------------------------------

function parseSession(session: GeminiSession): ConvTurn[] {
  const turns: ConvTurn[] = [];

  for (const msg of session.messages) {
    // Only process user and gemini (assistant) messages
    if (msg.type !== "user" && msg.type !== "gemini") continue;

    const role: "user" | "assistant" = msg.type === "user" ? "user" : "assistant";

    // Extract text content
    const textParts: string[] = [];
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.text) {
          textParts.push(block.text);
        }
      }
    }
    const content = textParts.join("\n");

    // Extract tool calls
    const toolCalls: ConvToolCall[] = [];
    if (Array.isArray(msg.toolCalls)) {
      for (const tc of msg.toolCalls) {
        const call: ConvToolCall = { name: tc.name };
        if (tc.args) {
          call.input = truncate(JSON.stringify(tc.args));
        }
        if (tc.result != null) {
          call.output = truncate(JSON.stringify(tc.result));
        }
        toolCalls.push(call);
      }
    }

    // Skip empty turns (no text and no tool calls)
    if (!content && toolCalls.length === 0) continue;

    const turn: ConvTurn = {
      tool: "gemini",
      session_id: session.sessionId,
      timestamp: msg.timestamp,
      role,
      content,
    };
    if (toolCalls.length > 0) turn.tool_calls = toolCalls;

    // Metadata for assistant messages
    if (role === "assistant") {
      const meta: Record<string, unknown> = {};
      if (msg.model) meta.model = msg.model;
      if (msg.tokens) meta.tokens = msg.tokens;
      if (Object.keys(meta).length > 0) turn.metadata = meta;
    }

    turns.push(turn);
  }

  return turns;
}

// ---------------------------------------------------------------------------
// Public collector
// ---------------------------------------------------------------------------

/**
 * Collect Gemini conversations for a fed session.
 *
 * Searches ~/.gemini/tmp/ for session files that match the worktree and
 * were created after the fed session start time.
 */
export function collectGemini(sessionDir: string, meta: MetaJson): CollectorResult[] {
  const sessions = findGeminiSessions(meta);
  if (sessions.length === 0) return [];

  const results: CollectorResult[] = [];

  for (let i = 0; i < sessions.length; i++) {
    const { filePath, session } = sessions[i];
    const turns = parseSession(session);
    if (turns.length === 0) continue;

    // Use index-based pane naming since Gemini doesn't track tmux panes
    const pane = `gemini-${i}`;

    results.push({
      tool: "gemini",
      pane,
      sessionId: session.sessionId,
      startedAt: session.startTime,
      sourcePath: filePath,
      turns,
    });
  }

  return results;
}
