import fs from "node:fs";
import path from "node:path";
import { CLAUDE_PROJECTS_DIR, truncate } from "../conv-store.js";
import type { CollectorResult, ConvTurn, ConvToolCall } from "../conv-store.js";
import type { MetaJson } from "../types.js";

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
// Project directory resolution
// ---------------------------------------------------------------------------

/**
 * Compute the Claude projects directory name from a project path.
 * Claude Code encodes paths by replacing "/" with "-".
 * e.g., "/Users/foo/bar" -> "-Users-foo-bar"
 */
function computeProjectDirName(projectPath: string): string {
  return projectPath.replace(/\//g, "-");
}

/**
 * Find the Claude projects directory for a given worktree path.
 * Returns the directory path if found, null otherwise.
 */
function findProjectDir(worktreePath: string): string | null {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return null;

  const dirName = computeProjectDirName(worktreePath);
  const candidate = path.join(CLAUDE_PROJECTS_DIR, dirName);
  if (fs.existsSync(candidate)) return candidate;

  return null;
}

// ---------------------------------------------------------------------------
// Find Claude sessions matching a fed session
// ---------------------------------------------------------------------------

interface FoundSession {
  sessionId: string;
  filePath: string;
  startedAt: string;
}

/**
 * Find Claude Code transcript files that belong to a fed session.
 * Matches by worktree path (project directory) and session start time.
 */
function findClaudeSessions(meta: MetaJson): FoundSession[] {
  const worktree = meta.worktree;
  if (!worktree) return [];

  const projectDir = findProjectDir(worktree);
  if (!projectDir) return [];

  const sessionStart = new Date(meta.created_at).getTime();
  const results: FoundSession[] = [];

  for (const file of fs.readdirSync(projectDir)) {
    if (!file.endsWith(".jsonl")) continue;

    const filePath = path.join(projectDir, file);
    const sessionId = file.replace(/\.jsonl$/, "");

    // Read first line to check timestamp
    let firstTimestamp: string | null = null;
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const firstNewline = content.indexOf("\n");
      const firstLine = firstNewline >= 0 ? content.slice(0, firstNewline) : content;
      if (!firstLine.trim()) continue;

      const entry = JSON.parse(firstLine) as Record<string, unknown>;
      firstTimestamp = (entry.timestamp as string) ?? null;
    } catch {
      continue;
    }

    if (!firstTimestamp) continue;

    // Filter: session must have started after fed session creation
    const entryTime = new Date(firstTimestamp).getTime();
    if (isNaN(entryTime) || entryTime < sessionStart) continue;

    results.push({
      sessionId,
      filePath,
      startedAt: firstTimestamp,
    });
  }

  return results;
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

      // Extract text content (skip thinking blocks for content)
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

/**
 * Collect Claude Code conversations for a fed session.
 *
 * Searches ~/.claude/projects/ for transcript files matching the session's
 * worktree path and created after the session start time.
 */
export function collectClaude(sessionDir: string, meta: MetaJson): CollectorResult[] {
  const sessions = findClaudeSessions(meta);
  if (sessions.length === 0) return [];

  const results: CollectorResult[] = [];

  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    const turns = parseTranscript(session.filePath, session.sessionId);
    if (turns.length === 0) continue;

    // Use index-based pane naming since we no longer track per-pane sessions
    const pane = `claude-${i}`;

    results.push({
      tool: "claude",
      pane,
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      sourcePath: session.filePath,
      turns,
    });
  }

  return results;
}
