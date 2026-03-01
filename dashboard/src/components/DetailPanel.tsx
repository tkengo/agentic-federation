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
import { REPOS_DIR } from "../utils/types.js";
import type { ArtifactEntry } from "./ArtifactList.js";

// Unicode emoji icons (string-width correctly reports 2 for these)
const ICON_ARTIFACT = "\u{1F4C4}"; // 📄
const ICON_SCRIPT = "\u{1F4DC}";   // 📜
const ICON_PANE = "\u{1F4BB}"; // 💻
const ICON_PLAY = "\u{25B6}\uFE0F"; // ▶️
const ICON_SEND = "\u{1F4E8}"; // 📨

const MAX_VISIBLE = 15;
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
  colWidths: {
    repoBranch: number;
    workflow: number;
    status: number;
  };
  worktree?: string;
  description?: string;
  mode: DetailMode;
  // Browse mode
  artifacts: ArtifactEntry[];
  scripts: ScriptEntry[];
  panes: PaneEntry[];
  selectedIndex: number;
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
  colWidths,
  worktree,
  description,
  mode,
  artifacts,
  scripts,
  panes,
  selectedIndex,
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
  const blinkOn = useBlink(500);

  // Box width (same formula as ArtifactList)
  const boxWidth = 4 + colWidths.repoBranch + 2 + colWidths.workflow + 2 + colWidths.status + 2 + 4 + 2 + 4 + 50;
  const innerWidth = boxWidth - 4;

  const worktreeHeader = worktree ? (
    <>
      <Text dimColor>{shortenHome(worktree)}</Text>
      <Text>{" "}</Text>
    </>
  ) : null;

  if (mode === "sending") {
    return (
      <Box marginLeft={3} width={boxWidth} borderStyle="round" flexDirection="column" paddingX={1}>
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
      <Box marginLeft={3} width={boxWidth} borderStyle="round" flexDirection="column" paddingX={1}>
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
    <Box marginLeft={3} width={boxWidth} borderStyle="round" flexDirection="column" paddingX={1}>
      {worktreeHeader}
      <BrowseView
        innerWidth={innerWidth}
        description={description}
        artifacts={artifacts}
        scripts={scripts}
        panes={panes}
        selectedIndex={selectedIndex}
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
}: {
  innerWidth: number;
  description?: string;
  artifacts: ArtifactEntry[];
  scripts: ScriptEntry[];
  panes: PaneEntry[];
  selectedIndex: number;
}) {
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
  const scrollOffset = computeScrollOffset(Math.max(0, selectedRowIndex), rows.length, MAX_VISIBLE);
  const visibleRows = rows.slice(scrollOffset, scrollOffset + MAX_VISIBLE);
  const hasMoreUp = scrollOffset > 0;
  const hasMoreDown = scrollOffset + MAX_VISIBLE < rows.length;

  const truncatedDesc = description
    ? truncateLines(description, innerWidth, DESC_MAX_LINES)
    : null;

  // Compute max script name length for alignment
  const maxScriptNameLen = scripts.length > 0
    ? Math.max(12, ...scripts.map((s) => s.name.length))
    : 12;

  // Compute max pane display name length for alignment
  const maxPaneNameLen = panes.length > 0
    ? Math.max(16, ...panes.map((p) => p.displayName.length))
    : 16;

  return (
    <>
      {truncatedDesc && (
        <>
          <Text>{truncatedDesc}</Text>
          <Text>{" "}</Text>
        </>
      )}
      {visibleRows.map((row, i) => {
        const isFirst = i === 0;
        const isLast = i === visibleRows.length - 1;
        const indicator = (isFirst && hasMoreUp) ? " \u25B2" : (isLast && hasMoreDown) ? " \u25BC" : "";

        if (row.type === "header") {
          return (
            <Box key={`h-${row.label}-${scrollOffset}`}>
              <Box flexGrow={1} marginLeft={1}>
                <Text dimColor> {row.label} </Text>
              </Box>
              {indicator && <Text dimColor>{indicator}</Text>}
            </Box>
          );
        }

        if (row.type === "blank") {
          return (
            <Box key={`b-${scrollOffset}-${i}`}>
              <Box flexGrow={1}><Text>{" "}</Text></Box>
              {indicator && <Text dimColor>{indicator}</Text>}
            </Box>
          );
        }

        if (row.type === "artifact") {
          const selected = row.itemIndex === selectedIndex;
          const cursor = selected ? "> " : "  ";
          // cursor(2) + icon(2) + space(1) + name + space(1) + sizeKB
          const nameMax = innerWidth - 2 - 3 - 1 - row.sizeKB.length;
          const displayName = row.name.length > nameMax
            ? row.name.slice(0, nameMax - 1) + "\u2026"
            : row.name.padEnd(nameMax);
          return (
            <Box key={`a-${row.name}`}>
              <Box flexGrow={1}>
                <Text color={selected ? "cyan" : undefined} bold={selected}>
                  {cursor}{ICON_ARTIFACT} {displayName} {row.sizeKB}
                </Text>
              </Box>
              {indicator && <Text dimColor>{indicator}</Text>}
            </Box>
          );
        }

        if (row.type === "script") {
          const selected = row.itemIndex === selectedIndex;
          const cursor = selected ? "> " : "  ";
          const displayName = row.name.length > maxScriptNameLen
            ? row.name.slice(0, maxScriptNameLen - 1) + "\u2026"
            : row.name.padEnd(maxScriptNameLen);
          // cursor(2) + icon(2) + space(1) + scriptName + space(1)
          const descSpace = innerWidth - 2 - 3 - maxScriptNameLen - 1;
          const desc = row.description
            ? (row.description.length > descSpace
              ? row.description.slice(0, descSpace - 1) + "\u2026"
              : row.description)
            : "";
          return (
            <Box key={`s-${row.name}`}>
              <Box flexGrow={1}>
                <Text color={selected ? "cyan" : undefined} bold={selected}>
                  {cursor}{ICON_SCRIPT} {displayName}
                </Text>
                {desc && <Text dimColor> {desc}</Text>}
              </Box>
              {indicator && <Text dimColor>{indicator}</Text>}
            </Box>
          );
        }

        if (row.type === "pane") {
          const selected = row.itemIndex === selectedIndex;
          const cursor = selected ? "> " : "  ";
          const displayName = row.displayName.length > maxPaneNameLen
            ? row.displayName.slice(0, maxPaneNameLen - 1) + "\u2026"
            : row.displayName.padEnd(maxPaneNameLen);
          // cursor(2) + icon(2+VS16) + space(1) + name + space(1)
          const descSpace = innerWidth - 2 - 3 - maxPaneNameLen - 1;
          const desc = row.description
            ? (row.description.length > descSpace
              ? row.description.slice(0, descSpace - 1) + "\u2026"
              : row.description)
            : "";
          return (
            <Box key={`pn-${row.displayName}`}>
              <Box flexGrow={1}>
                <Text color={selected ? "cyan" : undefined} bold={selected}>
                  {cursor}{ICON_PANE} {displayName}
                </Text>
                {desc && <Text dimColor> {desc}</Text>}
              </Box>
              {indicator && <Text dimColor>{indicator}</Text>}
            </Box>
          );
        }

        return null;
      })}
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

  // Log scrolling
  const visibleLog = logLines.slice(logScroll, logScroll + LOG_MAX_VISIBLE);
  const hasMoreUp = logScroll > 0;
  const hasMoreDown = logScroll + LOG_MAX_VISIBLE < logLines.length;

  return (
    <>
      {/* Header */}
      <Box>
        {headerIcon}
        <Text color={headerColor} bold>{headerText}</Text>
      </Box>
      {/* Log lines */}
      {visibleLog.map((line, i) => {
        const isFirst = i === 0;
        const isLast = i === visibleLog.length - 1;
        const indicator = (isFirst && hasMoreUp) ? " \u25B2" : (isLast && hasMoreDown) ? " \u25BC" : "";
        const maxLen = innerWidth - (indicator ? 2 : 0);
        const displayLine = line.length > maxLen
          ? line.slice(0, maxLen - 1) + "\u2026"
          : line;
        return (
          <Box key={`l-${logScroll}-${i}`}>
            <Box flexGrow={1}><Text>{displayLine || " "}</Text></Box>
            {indicator && <Text dimColor>{indicator}</Text>}
          </Box>
        );
      })}
      {/* Pad to keep height stable */}
      {Array.from({ length: Math.max(0, LOG_MAX_VISIBLE - visibleLog.length) }, (_, i) => {
        const isLastPad = i === LOG_MAX_VISIBLE - visibleLog.length - 1;
        const indicator = (isLastPad && hasMoreDown) ? " \u25BC" : "";
        return (
          <Box key={`p-${i}`}>
            <Box flexGrow={1}><Text>{" "}</Text></Box>
            {indicator && <Text dimColor>{indicator}</Text>}
          </Box>
        );
      })}
    </>
  );
}
