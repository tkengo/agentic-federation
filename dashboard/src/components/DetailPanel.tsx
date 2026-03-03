import React, { useMemo } from "react";
import { Box, Text } from "ink";
import fs from "node:fs";
import path from "node:path";
import stringWidth from "string-width";
import { parse as parseYaml } from "yaml";
import { computeScrollOffset } from "../utils/scroll.js";
import { shortenHome } from "../utils/format.js";
import { useBlink } from "../hooks/useBlink.js";
import { EmacsTextInput } from "./EmacsTextInput.js";
import { ScrollableRows, INDICATOR_COL_WIDTH } from "./ScrollableRows.js";
import { REPOS_DIR } from "../utils/types.js";
import type { ArtifactEntry } from "./ArtifactList.js";

// Unicode emoji icons (string-width correctly reports 2 for these)
const ICON_ARTIFACT = "\u{1F4C4}"; // 📄
const ICON_SCRIPT = "\u{1F4DC}";   // 📜
const ICON_PANE = "\u{1F4BB}"; // 💻
const ICON_PLAY = "\u{25BA}";       // ►
const ICON_SEND = "\u{1F4E8}"; // 📨

export const MAX_VISIBLE = 15;
export const LOG_MAX_VISIBLE = 9; // 10 total - 1 header line

// --- Script types and hook ---

export interface ScriptEntry {
  name: string;
  description?: string;
  path: string;
  env?: Record<string, string>;
  cwd?: string;
}

export function useScripts(sessionDir: string): ScriptEntry[] {
  return useMemo(() => {
    if (!sessionDir) return [];
    try {
      // Read meta.json to get repo name
      const metaPath = path.join(sessionDir, "meta.json");
      if (!fs.existsSync(metaPath)) return [];
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      const repoName = meta.repo;
      if (!repoName) return [];

      // Read repo config JSON
      const repoConfigPath = path.join(REPOS_DIR, `${repoName}.json`);
      if (!fs.existsSync(repoConfigPath)) return [];
      const repoConfig = JSON.parse(fs.readFileSync(repoConfigPath, "utf-8"));
      const scripts = repoConfig.scripts as Record<string, {
        path: string;
        description?: string;
        env?: Record<string, string>;
        cwd?: string;
      }> | undefined;
      if (!scripts) return [];

      return Object.entries(scripts).map(([name, def]) => ({
        name,
        description: def.description,
        path: def.path,
        env: def.env,
        cwd: def.cwd,
      }));
    } catch {
      return [];
    }
  }, [sessionDir]);
}

// --- Pane types and hook ---

export interface PaneEntry {
  windowName: string;
  paneName: string;
  displayName: string;    // "window.pane"
  description: string;    // pane.description ?? pane.command ?? ""
  tmuxTarget: string;     // "tmuxSession:windowName.paneNumber"
}

interface WorkflowYamlPane {
  id: string;
  name: string;
  pane: number;
  command: string | null;
  description?: string;
}

interface WorkflowYamlWindow {
  name: string;
  panes: WorkflowYamlPane[];
}

export function usePanes(sessionDir: string): PaneEntry[] {
  return useMemo(() => {
    if (!sessionDir) return [];
    try {
      const workflowPath = path.join(sessionDir, "workflow.yaml");
      if (!fs.existsSync(workflowPath)) return [];
      const raw = fs.readFileSync(workflowPath, "utf-8");
      const wf = parseYaml(raw) as { windows?: WorkflowYamlWindow[] };

      // Read tmux session name from meta.json
      const metaPath = path.join(sessionDir, "meta.json");
      if (!fs.existsSync(metaPath)) return [];
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      const tmuxSession: string = meta.tmux_session;
      if (!tmuxSession) return [];

      const entries: PaneEntry[] = [];
      for (const win of wf.windows ?? []) {
        for (const pane of win.panes ?? []) {
          entries.push({
            windowName: win.name,
            paneName: pane.name,
            displayName: `${win.name}.${pane.name}`,
            description: pane.description ?? pane.command ?? "",
            tmuxTarget: `${tmuxSession}:${win.name}.${pane.pane}`,
          });
        }
      }
      return entries;
    } catch {
      return [];
    }
  }, [sessionDir]);
}

// --- Virtual row types for browse mode ---

type VirtualRow =
  | { type: "header"; label: string }
  | { type: "artifact"; itemIndex: number; name: string; sizeKB: string }
  | { type: "script"; itemIndex: number; name: string; description?: string }
  | { type: "pane"; itemIndex: number; displayName: string; description: string }
  | { type: "blank" };

// --- Component ---

export type DetailMode = "browse" | "running" | "done" | "sending";

interface DetailPanelProps {
  width: number;
  worktree?: string;
  description?: string;
  hideDescription?: boolean;
  mode: DetailMode;
  // Browse mode
  artifacts: ArtifactEntry[];
  scripts: ScriptEntry[];
  panes: PaneEntry[];
  selectedIndex: number;
  maxVisible?: number; // Override default MAX_VISIBLE
  // Log mode (running/done)
  scriptName?: string;
  scriptExitCode?: number | null;
  scriptKilled?: boolean;
  logLines?: string[];
  logScroll?: number;
  // Sending mode
  sendingPaneDisplayName?: string;
  sendingValue?: string;
  onSendingChange?: (value: string) => void;
  onSendingSubmit?: (value: string) => void;
}

const DESC_MAX_LINES = 3;

function truncateLines(text: string, lineWidth: number, maxLines: number): string {
  const maxCols = lineWidth * maxLines;
  if (stringWidth(text) <= maxCols) return text;
  // Trim by visual width
  let cols = 0;
  let i = 0;
  for (const ch of text) {
    const w = stringWidth(ch);
    if (cols + w > maxCols - 1) break; // -1 for ellipsis
    cols += w;
    i += ch.length;
  }
  return text.slice(0, i) + "\u2026";
}

export function DetailPanel({
  width,
  worktree,
  description,
  hideDescription,
  mode,
  artifacts,
  scripts,
  panes,
  selectedIndex,
  maxVisible: maxVisibleOverride,
  scriptName,
  scriptExitCode,
  scriptKilled,
  logLines = [],
  logScroll = 0,
  sendingPaneDisplayName,
  sendingValue,
  onSendingChange,
  onSendingSubmit,
}: DetailPanelProps) {
  // Only run the blink timer when a script is running (the play icon blinks).
  // Avoids unnecessary re-renders that disrupt IME cursor positioning.
  const blinkOn = useBlink(500, mode === "running");

  const boxWidth = width;
  const innerWidth = boxWidth - 4;

  const worktreeHeader = worktree ? (
    <>
      <Text dimColor>{shortenHome(worktree)}</Text>
      <Text>{" "}</Text>
    </>
  ) : null;

  if (mode === "sending") {
    return (
      <Box width={boxWidth} borderStyle="round" flexDirection="column" paddingX={1}>
        {worktreeHeader}
        <Box>
          <Text>{ICON_SEND} </Text>
          <Text bold>{sendingPaneDisplayName}</Text>
        </Box>
        <Box>
          <Text color="cyan">{"> "}</Text>
          <EmacsTextInput
            value={sendingValue ?? ""}
            onChange={onSendingChange ?? (() => {})}
            onSubmit={onSendingSubmit}
          />
        </Box>
        <Text>{" "}</Text>
        <Text dimColor>[Enter] Send  [Esc] Cancel</Text>
      </Box>
    );
  }

  if (mode === "running" || mode === "done") {
    return (
      <Box width={boxWidth} borderStyle="round" flexDirection="column" paddingX={1}>
        {worktreeHeader}
        <LogView
          innerWidth={innerWidth}
          mode={mode}
          scriptName={scriptName ?? ""}
          scriptExitCode={scriptExitCode}
          scriptKilled={scriptKilled}
          logLines={logLines}
          logScroll={logScroll}
          blinkOn={blinkOn}
        />
      </Box>
    );
  }

  return (
    <Box width={boxWidth} borderStyle="round" flexDirection="column" paddingX={1}>
      {worktreeHeader}
      <BrowseView
        innerWidth={innerWidth}
        description={hideDescription ? undefined : description}
        artifacts={artifacts}
        scripts={scripts}
        panes={panes}
        selectedIndex={selectedIndex}
        maxVisible={maxVisibleOverride}
      />
    </Box>
  );
}

// --- Browse view ---

function BrowseView({
  innerWidth,
  description,
  artifacts,
  scripts,
  panes,
  selectedIndex,
  maxVisible: maxVisibleProp,
}: {
  innerWidth: number;
  description?: string;
  artifacts: ArtifactEntry[];
  scripts: ScriptEntry[];
  panes: PaneEntry[];
  selectedIndex: number;
  maxVisible?: number;
}) {
  const effectiveMaxVisible = maxVisibleProp ?? MAX_VISIBLE;
  const hasItems = artifacts.length > 0 || scripts.length > 0 || panes.length > 0;

  if (!description && !hasItems) {
    return <Text dimColor>(empty)</Text>;
  }

  // Build virtual rows
  const rows: VirtualRow[] = [];
  if (artifacts.length > 0) {
    rows.push({ type: "header", label: "Artifacts" });
    artifacts.forEach((a, i) => rows.push({
      type: "artifact", itemIndex: i, name: a.name, sizeKB: a.sizeKB,
    }));
  }
  if (artifacts.length > 0 && scripts.length > 0) {
    rows.push({ type: "blank" });
  }
  if (scripts.length > 0) {
    rows.push({ type: "header", label: "Scripts" });
    scripts.forEach((s, i) => rows.push({
      type: "script", itemIndex: artifacts.length + i, name: s.name, description: s.description,
    }));
  }
  if ((artifacts.length > 0 || scripts.length > 0) && panes.length > 0) {
    rows.push({ type: "blank" });
  }
  if (panes.length > 0) {
    rows.push({ type: "header", label: "Panes" });
    panes.forEach((p, i) => rows.push({
      type: "pane",
      itemIndex: artifacts.length + scripts.length + i,
      displayName: p.displayName,
      description: p.description,
    }));
  }

  // Compute scroll offset based on selected row position
  const selectedRowIndex = rows.findIndex(
    (r) => (r.type === "artifact" || r.type === "script" || r.type === "pane") && r.itemIndex === selectedIndex
  );
  const scrollOffset = computeScrollOffset(Math.max(0, selectedRowIndex), rows.length, effectiveMaxVisible);

  const truncatedDesc = description
    ? truncateLines(description, innerWidth, DESC_MAX_LINES)
    : null;

  // Content width accounts for indicator column when scrolling is needed
  const contentWidth = innerWidth - (rows.length > effectiveMaxVisible ? INDICATOR_COL_WIDTH : 0);

  // Compute max script name length for alignment
  const maxScriptNameLen = scripts.length > 0
    ? Math.max(12, ...scripts.map((s) => s.name.length))
    : 12;

  // Compute max pane display name length for alignment
  const maxPaneNameLen = panes.length > 0
    ? Math.max(16, ...panes.map((p) => p.displayName.length))
    : 16;

  const renderRow = (row: VirtualRow) => {
    if (row.type === "header") {
      return (
        <Box marginLeft={1}>
          <Text dimColor> {row.label} </Text>
        </Box>
      );
    }

    if (row.type === "blank") {
      return <Text>{" "}</Text>;
    }

    if (row.type === "artifact") {
      const selected = row.itemIndex === selectedIndex;
      const cursor = selected ? "> " : "  ";
      // cursor(2) + icon(2) + space(1) + name ... space(1) + sizeKB
      const nameMax = contentWidth - 2 - 3 - 1 - row.sizeKB.length;
      const displayName = row.name.length > nameMax
        ? row.name.slice(0, nameMax - 1) + "\u2026"
        : row.name;
      return (
        <>
          <Text color={selected ? "cyan" : undefined} bold={selected}>
            {cursor}{ICON_ARTIFACT} {displayName}
          </Text>
          <Box flexGrow={1} />
          <Text color={selected ? "cyan" : undefined} bold={selected}>
            {" "}{row.sizeKB}
          </Text>
        </>
      );
    }

    if (row.type === "script") {
      const selected = row.itemIndex === selectedIndex;
      const cursor = selected ? "> " : "  ";
      const displayName = row.name.length > maxScriptNameLen
        ? row.name.slice(0, maxScriptNameLen - 1) + "\u2026"
        : row.name.padEnd(maxScriptNameLen);
      // cursor(2) + icon(2) + space(1) + scriptName + space(1)
      const descSpace = contentWidth - 2 - 3 - maxScriptNameLen - 1;
      const desc = row.description
        ? (row.description.length > descSpace
          ? row.description.slice(0, descSpace - 1) + "\u2026"
          : row.description)
        : "";
      return (
        <>
          <Text color={selected ? "cyan" : undefined} bold={selected}>
            {cursor}{ICON_SCRIPT} {displayName}
          </Text>
          {desc && <Text dimColor> {desc}</Text>}
        </>
      );
    }

    if (row.type === "pane") {
      const selected = row.itemIndex === selectedIndex;
      const cursor = selected ? "> " : "  ";
      const displayName = row.displayName.length > maxPaneNameLen
        ? row.displayName.slice(0, maxPaneNameLen - 1) + "\u2026"
        : row.displayName.padEnd(maxPaneNameLen);
      // cursor(2) + icon(2+VS16) + space(1) + name + space(1)
      const descSpace = contentWidth - 2 - 3 - maxPaneNameLen - 1;
      const desc = row.description
        ? (row.description.length > descSpace
          ? row.description.slice(0, descSpace - 1) + "\u2026"
          : row.description)
        : "";
      return (
        <>
          <Text color={selected ? "cyan" : undefined} bold={selected}>
            {cursor}{ICON_PANE} {displayName}
          </Text>
          {desc && <Text dimColor> {desc}</Text>}
        </>
      );
    }

    return null;
  };

  return (
    <>
      {truncatedDesc && (
        <>
          <Text>{truncatedDesc}</Text>
          <Text>{" "}</Text>
        </>
      )}
      <ScrollableRows
        items={rows}
        maxVisible={effectiveMaxVisible}
        scrollOffset={scrollOffset}
        renderRow={(row) => renderRow(row)}
        keyExtractor={(row, index) => {
          switch (row.type) {
            case "header": return `h-${row.label}-${index}`;
            case "blank": return `b-${index}`;
            case "artifact": return `a-${row.name}`;
            case "script": return `s-${row.name}`;
            case "pane": return `pn-${row.displayName}`;
            default: return `row-${index}`;
          }
        }}
        padEmpty={false}
      />
    </>
  );
}

// --- Log view ---

function LogView({
  innerWidth,
  mode,
  scriptName,
  scriptExitCode,
  scriptKilled,
  logLines,
  logScroll,
  blinkOn,
}: {
  innerWidth: number;
  mode: "running" | "done";
  scriptName: string;
  scriptExitCode?: number | null;
  scriptKilled?: boolean;
  logLines: string[];
  logScroll: number;
  blinkOn: boolean;
}) {
  // Header
  let headerIcon: React.ReactNode;
  let headerText: string;
  let headerColor: string;

  if (mode === "running") {
    headerIcon = <Text color="green" dimColor={!blinkOn}>{ICON_PLAY} </Text>;
    headerText = scriptName;
    headerColor = "green";
  } else if (scriptKilled) {
    headerIcon = <Text color="red">{"\u2717 "}</Text>;
    headerText = `${scriptName} (killed)`;
    headerColor = "red";
  } else if (scriptExitCode === 0) {
    headerIcon = <Text color="green">{"\u2713 "}</Text>;
    headerText = `${scriptName} (exit 0)`;
    headerColor = "green";
  } else {
    headerIcon = <Text color="red">{"\u2717 "}</Text>;
    headerText = `${scriptName} (exit ${scriptExitCode})`;
    headerColor = "red";
  }

  // Content width accounts for indicator column when scrolling is needed
  const contentWidth = innerWidth - (logLines.length > LOG_MAX_VISIBLE ? INDICATOR_COL_WIDTH : 0);

  return (
    <>
      {/* Header */}
      <Box>
        {headerIcon}
        <Text color={headerColor} bold>{headerText}</Text>
      </Box>
      {/* Log lines */}
      <ScrollableRows
        items={logLines}
        maxVisible={LOG_MAX_VISIBLE}
        scrollOffset={logScroll}
        renderRow={(line) => {
          const displayLine = line.length > contentWidth
            ? line.slice(0, contentWidth - 1) + "\u2026"
            : line;
          return <Text>{displayLine || " "}</Text>;
        }}
      />
    </>
  );
}
