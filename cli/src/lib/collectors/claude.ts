import fs from "node:fs";
import path from "node:path";
import { CLAUDE_PROJECTS_DIR, truncate } from "../conv-store.js";
import type { CollectorResult, ConvTurn, ConvToolCall } from "../conv-store.js";

// ---------------------------------------------------------------------------
// Claude Code transcript JSONL line types (subset we care about)
// ---------------------------------------------------------------------------

interface ClaudeUserLine {
  type: "user";
  sessionId: string;
  timestamp: string;
  message: {
    role: "user";
    content: string;
  };
}

interface ClaudeAssistantLine {
  type: "assistant";
  sessionId: string;
  timestamp: string;
  message: {
    role: "assistant";
    model?: string;
    content: ClaudeContentBlock[];
  };
}

type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown };

// ---------------------------------------------------------------------------
// Session ID -> transcript path resolution
// ---------------------------------------------------------------------------

/**
 * Search ~/.claude/projects/ for a transcript JSONL file matching the given
 * session ID.  The filename is `<session-id>.jsonl`.
 */
function findTranscriptPath(sessionId: string): string | null {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return null;

  const target = `${sessionId}.jsonl`;
  for (const projectDir of fs.readdirSync(CLAUDE_PROJECTS_DIR)) {
    const candidate = path.join(CLAUDE_PROJECTS_DIR, projectDir, target);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parse a Claude transcript JSONL into ConvTurn[]
// ---------------------------------------------------------------------------

function parseTranscript(filePath: string, sessionId: string): ConvTurn[] {
  const raw = fs.readFileSync(filePath, "utf-8").trim();
  if (!raw) return [];

  const turns: ConvTurn[] = [];

  for (const line of raw.split("\n")) {
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const entryType = entry.type as string | undefined;

    // User message
    if (entryType === "user") {
      const u = entry as unknown as ClaudeUserLine;
      const content =
        typeof u.message?.content === "string"
          ? u.message.content
          : "";
      if (!content) continue;
      turns.push({
        tool: "claude",
        session_id: sessionId,
        timestamp: u.timestamp ?? new Date().toISOString(),
        role: "user",
        content,
      });
      continue;
    }

    // Assistant message
    if (entryType === "assistant") {
      const a = entry as unknown as ClaudeAssistantLine;
      const blocks = a.message?.content;
      if (!Array.isArray(blocks)) continue;

      // Extract text content (skip thinking blocks for content, but we could include them)
      const textParts: string[] = [];
      const toolCalls: ConvToolCall[] = [];

      for (const block of blocks) {
        if (block.type === "text") {
          textParts.push(block.text);
        } else if (block.type === "tool_use") {
          toolCalls.push({
            name: block.name,
            input: truncate(JSON.stringify(block.input)),
          });
        }
      }

      // Only emit a turn if there is text content or tool calls
      const content = textParts.join("\n");
      if (!content && toolCalls.length === 0) continue;

      const turn: ConvTurn = {
        tool: "claude",
        session_id: sessionId,
        timestamp: a.timestamp ?? new Date().toISOString(),
        role: "assistant",
        content,
      };
      if (toolCalls.length > 0) turn.tool_calls = toolCalls;

      const model = a.message?.model;
      if (model) turn.metadata = { model };

      turns.push(turn);
      continue;
    }

    // Skip file-history-snapshot and other types
  }

  return turns;
}

// ---------------------------------------------------------------------------
// Public collector
// ---------------------------------------------------------------------------

interface ClaudeSessionEntry {
  tool: string;
  session_id: string;
  args: string[];
  started_at: string;
}

/**
 * Collect Claude Code conversations for a fed session.
 *
 * Reads `<sessionDir>/claude-sessions/*.json` to discover which Claude Code
 * sessions were launched, then finds and parses their transcripts.
 */
export function collectClaude(sessionDir: string): CollectorResult[] {
  const claudeSessionsDir = path.join(sessionDir, "claude-sessions");
  if (!fs.existsSync(claudeSessionsDir)) return [];

  const results: CollectorResult[] = [];

  for (const file of fs.readdirSync(claudeSessionsDir)) {
    if (!file.endsWith(".json")) continue;

    const pane = file.replace(/\.json$/, "");
    let entry: ClaudeSessionEntry;
    try {
      entry = JSON.parse(
        fs.readFileSync(path.join(claudeSessionsDir, file), "utf-8")
      );
    } catch {
      continue;
    }

    const transcriptPath = findTranscriptPath(entry.session_id);
    if (!transcriptPath) {
      console.error(`    Warning: Claude transcript not found for session ${entry.session_id} (pane: ${pane})`);
      continue;
    }

    const turns = parseTranscript(transcriptPath, entry.session_id);
    if (turns.length === 0) continue;

    results.push({
      tool: "claude",
      pane,
      sessionId: entry.session_id,
      startedAt: entry.started_at,
      sourcePath: transcriptPath,
      turns,
    });
  }

  return results;
}
