import React from "react";
import { Box, Text } from "ink";
import fs from "node:fs";
import path from "node:path";
import stringWidth from "string-width";
import { computeScrollOffset } from "../utils/scroll.js";
import { shortenHome } from "../utils/format.js";
import { useBlink } from "../hooks/useBlink.js";
import { ScrollableRows, INDICATOR_COL_WIDTH } from "./ScrollableRows.js";
import { REPOS_DIR } from "../utils/types.js";

// Unicode emoji icons (string-width correctly reports 2 for these)
const ICON_SCRIPT = "\u{1F4DC}";   // 📜
const ICON_PLAY = "\u{25BA}";       // ►

export const MAX_VISIBLE = 15;
export const LOG_MAX_VISIBLE = 9; // 10 total - 1 header line

// --- Action types ---

export interface ActionEntry {
  id: string;         // e.g. "attach" | "delete"
  label: string;      // Display label
  icon: string;       // Unicode icon character
  color?: string;     // Optional color (e.g. "red" for destructive actions)
}

// --- Script types and hook ---

export interface ScriptEntry {
  name: string;
  description?: string;
  path: string;
  env?: Record<string, string>;
  cwd?: string;
}

export function useScripts(sessionDir: string): ScriptEntry[] {
  return React.useMemo(() => {
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

// --- Virtual row types for browse mode ---

type VirtualRow =
  | { type: "header"; label: string }
  | { type: "script"; itemIndex: number; name: string; description?: string }
  | { type: "action"; itemIndex: number; id: string; label: string; icon: string; color?: string }
  | { type: "blank" };

// --- Component ---

export type DetailMode = "browse" | "running" | "done";

interface DetailPanelProps {
  width: number;
  height?: number;
  worktree?: string;
  description?: string;
  hideDescription?: boolean;
  mode: DetailMode;
  // Browse mode
  scripts: ScriptEntry[];
  selectedIndex: number;
  maxVisible?: number; // Override default MAX_VISIBLE
  // Log mode (running/done)
  scriptName?: string;
  scriptExitCode?: number | null;
  scriptKilled?: boolean;
  logLines?: string[];
  logScroll?: number;
  logMaxVisible?: number; // Override default LOG_MAX_VISIBLE
  // Actions
  actions?: ActionEntry[];
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
  height,
  worktree,
  description,
  hideDescription,
  mode,
  scripts,
  selectedIndex,
  maxVisible: maxVisibleOverride,
  actions,
  scriptName,
  scriptExitCode,
  scriptKilled,
  logLines = [],
  logScroll = 0,
  logMaxVisible: logMaxVisibleOverride,
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

  if (mode === "running" || mode === "done") {
    return (
      <Box width={boxWidth} height={height} borderStyle="round" flexDirection="column" paddingX={1}>
        {worktreeHeader}
        <LogView
          innerWidth={innerWidth}
          mode={mode}
          scriptName={scriptName ?? ""}
          scriptExitCode={scriptExitCode}
          scriptKilled={scriptKilled}
          logLines={logLines}
          logScroll={logScroll}
          maxVisible={logMaxVisibleOverride}
          blinkOn={blinkOn}
        />
      </Box>
    );
  }

  return (
    <Box width={boxWidth} height={height} borderStyle="round" flexDirection="column" paddingX={1}>
      {worktreeHeader}
      <BrowseView
        innerWidth={innerWidth}
        description={hideDescription ? undefined : description}
        scripts={scripts}
        actions={actions}
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
  scripts,
  actions,
  selectedIndex,
  maxVisible: maxVisibleProp,
}: {
  innerWidth: number;
  description?: string;
  scripts: ScriptEntry[];
  actions?: ActionEntry[];
  selectedIndex: number;
  maxVisible?: number;
}) {
  const effectiveMaxVisible = maxVisibleProp ?? MAX_VISIBLE;
  const hasActions = actions != null && actions.length > 0;
  const hasItems = scripts.length > 0 || hasActions;

  if (!description && !hasItems) {
    return <Text dimColor>(empty)</Text>;
  }

  // Build virtual rows
  const rows: VirtualRow[] = [];
  if (scripts.length > 0) {
    rows.push({ type: "header", label: "Scripts" });
    scripts.forEach((s, i) => rows.push({
      type: "script", itemIndex: i, name: s.name, description: s.description,
    }));
  }
  if (scripts.length > 0 && hasActions) {
    rows.push({ type: "blank" });
  }
  if (hasActions) {
    rows.push({ type: "header", label: "Actions" });
    const baseIndex = scripts.length;
    actions!.forEach((a, i) => rows.push({
      type: "action",
      itemIndex: baseIndex + i,
      id: a.id,
      label: a.label,
      icon: a.icon,
      color: a.color,
    }));
  }

  // Compute scroll offset based on selected row position
  const selectedRowIndex = rows.findIndex(
    (r) => (r.type === "script" || r.type === "action") && r.itemIndex === selectedIndex
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

    if (row.type === "script") {
      const selected = row.itemIndex === selectedIndex;
      const cursor = selected ? "> " : "  ";
      const displayName = row.name.length > maxScriptNameLen
        ? row.name.slice(0, maxScriptNameLen - 1) + "\u2026"
        : row.name.padEnd(maxScriptNameLen);
      // cursor(2) + pad(2) + icon(2) + space(1) + scriptName + space(1)
      const descSpace = contentWidth - 2 - 2 - 3 - maxScriptNameLen - 1;
      const desc = row.description
        ? (row.description.length > descSpace
          ? row.description.slice(0, descSpace - 1) + "\u2026"
          : row.description)
        : "";
      return (
        <>
          <Text color={selected ? "cyan" : undefined} bold={selected}>
            {cursor}{"  "}{ICON_SCRIPT} {displayName}
          </Text>
          {desc && <Text dimColor> {desc}</Text>}
        </>
      );
    }

    if (row.type === "action") {
      const selected = row.itemIndex === selectedIndex;
      const cursor = selected ? "> " : "  ";
      const color = selected ? "cyan" : undefined;
      return (
        <Text color={color} bold={selected}>
          {cursor}{"  "}{row.icon} {row.label}
        </Text>
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
            case "script": return `s-${row.name}`;
            case "action": return `act-${row.id}`;
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
  maxVisible: maxVisibleOverride,
  blinkOn,
}: {
  innerWidth: number;
  mode: "running" | "done";
  scriptName: string;
  scriptExitCode?: number | null;
  scriptKilled?: boolean;
  logLines: string[];
  logScroll: number;
  maxVisible?: number;
  blinkOn: boolean;
}) {
  const effectiveMaxVisible = maxVisibleOverride ?? LOG_MAX_VISIBLE;
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
  const contentWidth = innerWidth - (logLines.length > effectiveMaxVisible ? INDICATOR_COL_WIDTH : 0);

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
        maxVisible={effectiveMaxVisible}
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
