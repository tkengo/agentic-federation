import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ScriptEntry } from "./DetailPanel.js";

export type SessionContextAction =
  | { kind: "attach" }
  | { kind: "delete" }
  | { kind: "openDetail" }
  | { kind: "copyName" }
  | { kind: "copyWorktree" }
  | { kind: "runScript"; scriptName: string };

interface MenuItem {
  id: "attach" | "delete" | "openDetail" | "copyName" | "copyWorktree" | "runScript";
  label: string;
  shortcut: string;
  color?: string;
  disabled?: boolean;
}

interface SessionContextMenuProps {
  sessionLabel: string;
  scripts: ScriptEntry[];
  hasWorktree: boolean;
  onAction: (action: SessionContextAction) => void;
  onClose: () => void;
}

const BASE_MAIN_ITEMS: { id: MenuItem["id"]; label: string; shortcut: string; color?: string }[] = [
  { id: "attach", label: "Attach to session", shortcut: "a" },
  { id: "delete", label: "Delete session", shortcut: "d", color: "red" },
  { id: "openDetail", label: "Open detail", shortcut: "i" },
  { id: "copyName", label: "Copy session name", shortcut: "y" },
  { id: "copyWorktree", label: "Copy worktree path", shortcut: "Y" },
  { id: "runScript", label: "Run script…", shortcut: "r" },
];

export function SessionContextMenu({
  sessionLabel,
  scripts,
  hasWorktree,
  onAction,
  onClose,
}: SessionContextMenuProps) {
  const [mode, setMode] = useState<"main" | "scripts">("main");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const mainItems: MenuItem[] = BASE_MAIN_ITEMS.map((it) => {
    if (it.id === "runScript") return { ...it, disabled: scripts.length === 0 };
    if (it.id === "copyWorktree") return { ...it, disabled: !hasWorktree };
    return { ...it };
  });

  const itemsCount = mode === "main" ? mainItems.length : Math.max(1, scripts.length);

  const executeMain = (id: MenuItem["id"]) => {
    if (id === "runScript") {
      setMode("scripts");
      setSelectedIndex(0);
      return;
    }
    if (id === "attach") onAction({ kind: "attach" });
    else if (id === "delete") onAction({ kind: "delete" });
    else if (id === "openDetail") onAction({ kind: "openDetail" });
    else if (id === "copyName") onAction({ kind: "copyName" });
    else if (id === "copyWorktree") onAction({ kind: "copyWorktree" });
  };

  useInput((input, key) => {
    if (key.escape) {
      if (mode === "scripts") {
        setMode("main");
        setSelectedIndex(0);
      } else {
        onClose();
      }
      return;
    }
    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => (i <= 0 ? itemsCount - 1 : i - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setSelectedIndex((i) => (i >= itemsCount - 1 ? 0 : i + 1));
      return;
    }
    if (key.return) {
      if (mode === "main") {
        const item = mainItems[selectedIndex];
        if (item && !item.disabled) executeMain(item.id);
      } else {
        const script = scripts[selectedIndex];
        if (script) onAction({ kind: "runScript", scriptName: script.name });
      }
      return;
    }
    if (mode === "main" && input) {
      const matched = mainItems.find((it) => it.shortcut === input);
      if (matched && !matched.disabled) executeMain(matched.id);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="single" marginX={1} paddingX={1}>
      <Box>
        <Text bold color="cyan">
          {mode === "main" ? sessionLabel : "Run script…"}
        </Text>
        <Text dimColor>
          {mode === "main"
            ? "  (Esc: close)"
            : "  (Esc: back)"}
        </Text>
      </Box>

      {mode === "main" ? (
        <Box flexDirection="column">
          {mainItems.map((item, idx) => {
            const isSel = idx === selectedIndex;
            const indicator = isSel ? "> " : "  ";
            const labelColor = item.disabled
              ? undefined
              : isSel
                ? "cyan"
                : item.color;
            return (
              <Box key={item.id}>
                <Text color={isSel && !item.disabled ? "cyan" : undefined}>
                  {indicator}
                </Text>
                <Box width={22}>
                  <Text color={labelColor} dimColor={item.disabled}>
                    {item.label}
                  </Text>
                </Box>
                <Text dimColor>{`(${item.shortcut})`}</Text>
              </Box>
            );
          })}
        </Box>
      ) : scripts.length === 0 ? (
        <Text dimColor>  No scripts available for this repo.</Text>
      ) : (
        <Box flexDirection="column">
          {scripts.map((script, idx) => {
            const isSel = idx === selectedIndex;
            return (
              <Box key={script.name}>
                <Text color={isSel ? "cyan" : undefined}>{isSel ? "> " : "  "}</Text>
                <Text color={isSel ? "cyan" : undefined}>{script.name}</Text>
                {script.description ? (
                  <Text dimColor>{`  ${script.description}`}</Text>
                ) : null}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
