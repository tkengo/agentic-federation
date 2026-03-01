import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { EmacsTextInput } from "./EmacsTextInput.js";
import { ScrollableRows } from "./ScrollableRows.js";
import { execSync } from "node:child_process";
import { filterCommands } from "../utils/commands.js";
import { computeScrollOffset } from "../utils/scroll.js";
import type { PaletteCommand } from "../utils/commands.js";

const MAX_VISIBLE = 6;

type SubMode = "search" | "confirm" | "output";

interface CommandPaletteProps {
  sessionName: string | undefined;
  hasSession: boolean;
  onClose: () => void;
  onAction: (commandId: string) => void;
  onScreenTransition: (commandId: string) => void;
  showMessage: (msg: string) => void;
}

export function CommandPalette({
  sessionName,
  hasSession,
  onClose,
  onAction,
  onScreenTransition,
  showMessage,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [subMode, setSubMode] = useState<SubMode>("search");
  const [pendingCommand, setPendingCommand] = useState<PaletteCommand | null>(null);
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const [outputScroll, setOutputScroll] = useState(0);

  const filtered = filterCommands(query, hasSession);

  // Clamp selected index when filtered list shrinks
  const clampedIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1));
  if (clampedIndex !== selectedIndex) {
    setSelectedIndex(clampedIndex);
  }

  const executeCommand = useCallback(
    (cmd: PaletteCommand) => {
      if (cmd.needsConfirmation) {
        setPendingCommand(cmd);
        setSubMode("confirm");
        return;
      }
      runCommand(cmd);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionName, hasSession],
  );

  const runCommand = useCallback(
    (cmd: PaletteCommand) => {
      if (cmd.resultType === "output") {
        // Run fed command and capture output
        let output = "";
        try {
          const fedCmd = buildFedCommand(cmd.id, sessionName);
          output = execSync(fedCmd, { encoding: "utf-8", timeout: 10000 });
        } catch (err: unknown) {
          output = (err as { stdout?: string }).stdout ?? `Error running: ${cmd.name}`;
        }
        const lines = output.split("\n");
        setOutputLines(lines);
        setOutputScroll(0);
        setSubMode("output");
      } else if (cmd.resultType === "screen-transition") {
        onScreenTransition(cmd.id);
      } else {
        // action
        onAction(cmd.id);
      }
    },
    [sessionName, onAction, onScreenTransition],
  );

  // Search mode input
  useInput(
    (input, key) => {
      const isUp = key.upArrow || (key.ctrl && input === 'p');
      const isDown = key.downArrow || (key.ctrl && input === 'n');
      if (key.escape) {
        onClose();
      } else if (key.return) {
        if (filtered.length > 0) {
          executeCommand(filtered[clampedIndex]!);
        }
      } else if (isUp) {
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (isDown) {
        setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
      }
    },
    { isActive: subMode === "search" },
  );

  // Confirm mode input
  useInput(
    (input) => {
      if (input === "y" || input === "Y") {
        if (pendingCommand) {
          runCommand(pendingCommand);
          setPendingCommand(null);
        }
      } else {
        setPendingCommand(null);
        setSubMode("search");
      }
    },
    { isActive: subMode === "confirm" },
  );

  // Output mode input
  useInput(
    (_input, key) => {
      if (key.escape) {
        setOutputLines([]);
        setOutputScroll(0);
        setSubMode("search");
      } else if (key.upArrow) {
        setOutputScroll((s) => Math.max(0, s - 1));
      } else if (key.downArrow) {
        setOutputScroll((s) => Math.min(Math.max(0, outputLines.length - MAX_VISIBLE), s + 1));
      }
    },
    { isActive: subMode === "output" },
  );

  // Render confirm mode
  if (subMode === "confirm" && pendingCommand) {
    return (
      <Box flexDirection="column">
        <Box
          flexDirection="column"
          borderStyle="single"
          marginX={1}
          paddingX={1}
        >
          <Text color="yellow">
            Run &quot;{pendingCommand.name}&quot;{sessionName ? ` on ${sessionName}` : ""}? [y] Yes  [any key] Cancel
          </Text>
        </Box>
      </Box>
    );
  }

  // Render output mode
  if (subMode === "output") {
    return (
      <Box flexDirection="column">
        <Box
          flexDirection="column"
          borderStyle="single"
          marginX={1}
          paddingX={1}
        >
          <Box marginBottom={0}>
            <Text bold>Output </Text>
            <Text dimColor>[Up/Down] Scroll  [Esc] Back</Text>
          </Box>
          <ScrollableRows
            items={outputLines}
            maxVisible={MAX_VISIBLE}
            scrollOffset={outputScroll}
            renderRow={(line) => <Text>{line}</Text>}
          />
        </Box>
      </Box>
    );
  }

  // Render search mode
  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="single"
        marginX={1}
        paddingX={1}
      >
        {/* Search input */}
        <Box>
          <Text bold>{": "}</Text>
          <EmacsTextInput value={query} onChange={(val) => { setQuery(val); setSelectedIndex(0); }} />
        </Box>

        {/* Command list */}
        {filtered.length === 0 ? (
          <Text dimColor>  No matching commands</Text>
        ) : (
          <Box flexDirection="column">
            <ScrollableRows
              items={filtered}
              maxVisible={MAX_VISIBLE}
              scrollOffset={computeScrollOffset(clampedIndex, filtered.length, MAX_VISIBLE)}
              renderRow={(cmd, realIndex) => {
                const isSel = realIndex === clampedIndex;
                return (
                  <Text>
                    {isSel ? <Text color="cyan">{"> "}</Text> : "  "}
                    {isSel ? <Text color="cyan">{cmd.name}</Text> : cmd.name}
                    <Text dimColor>  {cmd.description}</Text>
                  </Text>
                );
              }}
              keyExtractor={(cmd) => cmd.id}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}

function buildFedCommand(commandId: string, sessionName: string | undefined): string {
  switch (commandId) {
    case "info":
      return `fed info '${sessionName}'`;
    case "artifacts":
      return `fed artifact list '${sessionName}'`;
    case "state":
      return `fed state read '${sessionName}'`;
    default:
      return `fed ${commandId}`;
  }
}
