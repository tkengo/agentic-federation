import fs from "node:fs";
import path from "node:path";
import { requireSessionDir } from "../lib/session.js";
import { conversationsDir } from "../lib/conv-store.js";
import type { ConvMeta, ConvTurn } from "../lib/conv-store.js";

// ---------------------------------------------------------------------------
// fed conv list
// ---------------------------------------------------------------------------

export function convListCommand(): void {
  const sessionDir = requireSessionDir();
  const convDir = conversationsDir(sessionDir);

  if (!fs.existsSync(convDir)) {
    console.log("No conversations collected yet.");
    return;
  }

  const files = fs.readdirSync(convDir).filter((f) => f.endsWith(".jsonl"));
  if (files.length === 0) {
    console.log("No conversations collected yet.");
    return;
  }

  // Read meta from first line of each file
  console.log("");
  console.log(
    "  " +
    "File".padEnd(36) +
    "Tool".padEnd(10) +
    "Turns".padEnd(8) +
    "Collected At"
  );
  console.log("  " + "-".repeat(80));

  for (const file of files.sort()) {
    const filePath = path.join(convDir, file);
    const firstLine = fs.readFileSync(filePath, "utf-8").split("\n")[0];
    try {
      const meta = JSON.parse(firstLine) as ConvMeta;
      if (meta.type !== "meta") continue;
      console.log(
        "  " +
        file.padEnd(36) +
        meta.tool.padEnd(10) +
        String(meta.turn_count).padEnd(8) +
        meta.collected_at
      );
    } catch {
      console.log("  " + file.padEnd(36) + "(invalid)");
    }
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// fed conv show <name>
// ---------------------------------------------------------------------------

export function convShowCommand(name: string, raw?: boolean): void {
  const sessionDir = requireSessionDir();
  const convDir = conversationsDir(sessionDir);

  // Resolve filename: accept with or without .jsonl extension
  let filename = name;
  if (!filename.endsWith(".jsonl")) filename += ".jsonl";
  const filePath = path.join(convDir, filename);

  if (!fs.existsSync(filePath)) {
    console.error(`Error: Conversation file not found: ${filename}`);
    console.error(`  Available files:`);
    if (fs.existsSync(convDir)) {
      for (const f of fs.readdirSync(convDir).filter((f) => f.endsWith(".jsonl"))) {
        console.error(`    ${f.replace(/\.jsonl$/, "")}`);
      }
    }
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, "utf-8").trim();
  if (!content) {
    console.log("(empty conversation file)");
    return;
  }

  // Raw mode: just dump the JSONL
  if (raw) {
    console.log(content);
    return;
  }

  // Human-readable mode
  const lines = content.split("\n");
  const meta = JSON.parse(lines[0]) as ConvMeta;

  console.log(`=== ${meta.pane} (${meta.tool}) ===`);
  console.log(`Session: ${meta.session_id}`);
  console.log(`Source:  ${meta.source_path}`);
  console.log("");

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    let turn: ConvTurn;
    try {
      turn = JSON.parse(lines[i]);
    } catch {
      continue;
    }

    const ts = turn.timestamp.replace("T", " ").replace(/\.\d+Z$/, "Z");
    const roleLabel = turn.role === "user" ? "USER" : "ASSISTANT";

    console.log(`[${ts}] ${roleLabel}:`);
    if (turn.content) {
      // Indent content for readability
      for (const line of turn.content.split("\n")) {
        console.log(`  ${line}`);
      }
    }

    if (turn.tool_calls && turn.tool_calls.length > 0) {
      for (const tc of turn.tool_calls) {
        const inputPreview = tc.input ? tc.input.slice(0, 80) : "";
        console.log(`  [Tool: ${tc.name}] ${inputPreview}`);
      }
    }
    console.log("");
  }

  console.log("---");
  console.log(`${meta.turn_count} turns | Collected: ${meta.collected_at}`);
}
