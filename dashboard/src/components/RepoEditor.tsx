import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import fs from "node:fs";
import { ScrollableRows } from "./ScrollableRows.js";
import { EmacsTextInput } from "./EmacsTextInput.js";
import { computeScrollOffset } from "../utils/scroll.js";

// JSON shape — only the parts the editor cares about. Other fields are
// preserved as-is via spread to avoid losing scripts/workflow_overrides/extra.
export interface RepoConfigJson {
  repo_name: string;
  base_path: string;
  base_branch?: string;
  repo_root?: string;
  setup_scripts: string[];
  symlinks: string[];
  copy_files: string[];
  scripts?: Record<string, unknown>;
  env?: Record<string, string>;
  workflow_overrides?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  [key: string]: unknown;
}

type ScalarKey = "base_path" | "base_branch" | "repo_root";
type ArrayKey = "setup_scripts" | "symlinks" | "copy_files";

const SCALAR_FIELDS: { key: ScalarKey; label: string; placeholder: string; required: boolean }[] = [
  { key: "base_path", label: "base_path", placeholder: "(required)", required: true },
  { key: "base_branch", label: "base_branch", placeholder: "(default)", required: false },
  { key: "repo_root", label: "repo_root", placeholder: "(auto)", required: false },
];

const ARRAY_FIELDS: { key: ArrayKey; label: string }[] = [
  { key: "setup_scripts", label: "setup_scripts" },
  { key: "symlinks", label: "symlinks" },
  { key: "copy_files", label: "copy_files" },
];

const SCALAR_LABEL_WIDTH = Math.max(...SCALAR_FIELDS.map((f) => f.label.length));

type Row =
  | { type: "header"; label: string; rowKey: string }
  | { type: "blank"; rowKey: string }
  | { type: "scalar"; scalarKey: ScalarKey; rowKey: string }
  | { type: "array_item"; arrayKey: ArrayKey; index: number; rowKey: string }
  | { type: "array_add"; arrayKey: ArrayKey; rowKey: string }
  | { type: "action"; id: "open-nvim"; label: string; icon: string; rowKey: string };

type EditingState =
  | { kind: "scalar"; key: ScalarKey }
  | { kind: "array_edit"; arrayKey: ArrayKey; index: number }
  | { kind: "array_new"; arrayKey: ArrayKey };

interface RepoEditorProps {
  configPath: string;
  config: RepoConfigJson;
  width: number;
  height: number;
  active: boolean;
  onBack: () => void;
  onConfigSaved: () => void;
  onOpenInNvim: () => void;
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
  onEditingChange?: (editing: boolean) => void;
}

export function RepoEditor({
  configPath,
  config,
  width,
  height,
  active,
  onBack,
  onConfigSaved,
  onOpenInNvim,
  onMessage,
  onError,
  onEditingChange,
}: RepoEditorProps) {
  const rows: Row[] = useMemo(() => {
    const rs: Row[] = [];
    rs.push({ type: "header", label: "Settings", rowKey: "h-settings" });
    SCALAR_FIELDS.forEach((f) => rs.push({ type: "scalar", scalarKey: f.key, rowKey: `s-${f.key}` }));
    ARRAY_FIELDS.forEach((af) => {
      rs.push({ type: "blank", rowKey: `b-${af.key}` });
      rs.push({ type: "header", label: af.label, rowKey: `h-${af.key}` });
      const arr = (config[af.key] as string[] | undefined) ?? [];
      arr.forEach((_, i) => rs.push({ type: "array_item", arrayKey: af.key, index: i, rowKey: `a-${af.key}-${i}` }));
      rs.push({ type: "array_add", arrayKey: af.key, rowKey: `add-${af.key}` });
    });
    rs.push({ type: "blank", rowKey: "b-actions" });
    rs.push({ type: "header", label: "Actions", rowKey: "h-actions" });
    rs.push({ type: "action", id: "open-nvim", label: "Open in nvim", icon: "✎", rowKey: "act-nvim" });
    return rs;
  }, [config]);

  const selectableRowIndices = useMemo(
    () => rows
      .map((r, i) => (r.type === "header" || r.type === "blank") ? -1 : i)
      .filter((i) => i >= 0),
    [rows]
  );

  const [selectableIdx, setSelectableIdx] = useState(0);

  // Clamp when rows shrink (after delete)
  useEffect(() => {
    if (selectableIdx > selectableRowIndices.length - 1) {
      setSelectableIdx(Math.max(0, selectableRowIndices.length - 1));
    }
  }, [selectableRowIndices.length, selectableIdx]);

  const selectedRowIndex = selectableRowIndices[selectableIdx] ?? 0;
  const selectedRow = rows[selectedRowIndex];

  const [editing, setEditing] = useState<EditingState | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    onEditingChange?.(editing !== null);
  }, [editing, onEditingChange]);

  // Border (2) + hint line (1) = 3 vertical chars consumed by chrome
  const maxVisible = Math.max(3, height - 3);
  const scrollOffset = computeScrollOffset(selectedRowIndex, rows.length, maxVisible);

  function saveConfig(updated: RepoConfigJson, successMsg: string) {
    try {
      const json = JSON.stringify(updated, null, 2) + "\n";
      fs.writeFileSync(configPath, json, "utf-8");
      onConfigSaved();
      onMessage(successMsg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onError(`Failed to save config: ${msg}`);
    }
  }

  function startEdit() {
    if (!selectedRow) return;
    if (selectedRow.type === "scalar") {
      const current = (config[selectedRow.scalarKey] as string | undefined) ?? "";
      setEditValue(current);
      setEditing({ kind: "scalar", key: selectedRow.scalarKey });
    } else if (selectedRow.type === "array_item") {
      const arr = (config[selectedRow.arrayKey] as string[] | undefined) ?? [];
      setEditValue(arr[selectedRow.index] ?? "");
      setEditing({ kind: "array_edit", arrayKey: selectedRow.arrayKey, index: selectedRow.index });
    } else if (selectedRow.type === "array_add") {
      setEditValue("");
      setEditing({ kind: "array_new", arrayKey: selectedRow.arrayKey });
    } else if (selectedRow.type === "action" && selectedRow.id === "open-nvim") {
      onOpenInNvim();
    }
  }

  function commitEdit() {
    if (!editing) return;
    const next: RepoConfigJson = JSON.parse(JSON.stringify(config));
    const value = editValue;

    if (editing.kind === "scalar") {
      const k = editing.key;
      const field = SCALAR_FIELDS.find((f) => f.key === k)!;
      if (value === "") {
        if (field.required) {
          onError(`${field.label} is required`);
          return;
        }
        delete next[k];
      } else {
        next[k] = value;
      }
      saveConfig(next, `Updated ${field.label}`);
    } else if (editing.kind === "array_edit") {
      const arr = ((next[editing.arrayKey] as string[] | undefined) ?? []).slice();
      if (value === "") {
        arr.splice(editing.index, 1);
      } else {
        arr[editing.index] = value;
      }
      next[editing.arrayKey] = arr;
      saveConfig(next, `Updated ${editing.arrayKey}`);
    } else if (editing.kind === "array_new") {
      if (value === "") {
        setEditing(null);
        return;
      }
      const arr = ((next[editing.arrayKey] as string[] | undefined) ?? []).slice();
      arr.push(value);
      next[editing.arrayKey] = arr;
      saveConfig(next, `Added to ${editing.arrayKey}`);
    }
    setEditing(null);
  }

  function cancelEdit() {
    setEditing(null);
  }

  function deleteCurrent() {
    if (!selectedRow) return;
    if (selectedRow.type === "array_item") {
      const next: RepoConfigJson = JSON.parse(JSON.stringify(config));
      const arr = ((next[selectedRow.arrayKey] as string[] | undefined) ?? []).slice();
      arr.splice(selectedRow.index, 1);
      next[selectedRow.arrayKey] = arr;
      saveConfig(next, `Removed from ${selectedRow.arrayKey}`);
    } else if (selectedRow.type === "scalar") {
      const field = SCALAR_FIELDS.find((f) => f.key === selectedRow.scalarKey)!;
      if (field.required) {
        onError(`${field.label} is required`);
        return;
      }
      const next: RepoConfigJson = JSON.parse(JSON.stringify(config));
      delete next[selectedRow.scalarKey];
      saveConfig(next, `Cleared ${field.label}`);
    }
  }

  function startAddOnCurrentArray() {
    if (!selectedRow) return;
    let arrayKey: ArrayKey | null = null;
    if (selectedRow.type === "array_item") arrayKey = selectedRow.arrayKey;
    else if (selectedRow.type === "array_add") arrayKey = selectedRow.arrayKey;
    if (!arrayKey) return;
    setEditValue("");
    setEditing({ kind: "array_new", arrayKey });
  }

  // Browse-mode keyboard. Disabled while editing so EmacsTextInput owns input.
  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (input === " ") {
      onBack();
      return;
    }
    if (key.upArrow || input === "k" || (key.ctrl && input === "p")) {
      setSelectableIdx((s) => Math.max(0, s - 1));
    } else if (key.downArrow || input === "j" || (key.ctrl && input === "n")) {
      setSelectableIdx((s) => Math.min(selectableRowIndices.length - 1, s + 1));
    } else if (key.return) {
      startEdit();
    } else if (input === "a") {
      startAddOnCurrentArray();
    } else if (input === "d") {
      deleteCurrent();
    }
  }, { isActive: active && editing === null });

  // Edit-mode escape handler. EmacsTextInput passes Esc through (returns early).
  useInput((_input, key) => {
    if (key.escape) cancelEdit();
  }, { isActive: active && editing !== null });

  const renderRow = (row: Row, realIndex: number): React.ReactNode => {
    if (row.type === "header") {
      return (
        <Box>
          <Text dimColor bold>{row.label}</Text>
        </Box>
      );
    }
    if (row.type === "blank") {
      return <Text>{" "}</Text>;
    }

    const isSelected = realIndex === selectedRowIndex;
    const cursor = isSelected ? "> " : "  ";
    const cursorColor = isSelected ? "cyan" : undefined;

    if (row.type === "scalar") {
      const field = SCALAR_FIELDS.find((f) => f.key === row.scalarKey)!;
      const current = (config[row.scalarKey] as string | undefined) ?? "";
      const label = field.label.padEnd(SCALAR_LABEL_WIDTH);
      const isEditingHere = editing?.kind === "scalar" && editing.key === row.scalarKey;
      return (
        <Box>
          <Text color={cursorColor} bold={isSelected}>{cursor}{label}  </Text>
          {isEditingHere ? (
            <EmacsTextInput
              value={editValue}
              onChange={setEditValue}
              onSubmit={commitEdit}
              focus={true}
              placeholder={field.placeholder}
            />
          ) : current ? (
            <Text>{current}</Text>
          ) : (
            <Text dimColor>{field.placeholder}</Text>
          )}
        </Box>
      );
    }

    if (row.type === "array_item") {
      const arr = (config[row.arrayKey] as string[] | undefined) ?? [];
      const value = arr[row.index] ?? "";
      const isEditingHere = editing?.kind === "array_edit"
        && editing.arrayKey === row.arrayKey && editing.index === row.index;
      return (
        <Box>
          <Text color={cursorColor} bold={isSelected}>{cursor}</Text>
          <Text dimColor>[{row.index}] </Text>
          {isEditingHere ? (
            <EmacsTextInput
              value={editValue}
              onChange={setEditValue}
              onSubmit={commitEdit}
              focus={true}
            />
          ) : (
            <Text>{value}</Text>
          )}
        </Box>
      );
    }

    if (row.type === "array_add") {
      const isEditingHere = editing?.kind === "array_new" && editing.arrayKey === row.arrayKey;
      if (isEditingHere) {
        return (
          <Box>
            <Text color={cursorColor} bold={isSelected}>{cursor}</Text>
            <Text dimColor>[+] </Text>
            <EmacsTextInput
              value={editValue}
              onChange={setEditValue}
              onSubmit={commitEdit}
              focus={true}
            />
          </Box>
        );
      }
      return (
        <Box>
          <Text color={cursorColor} bold={isSelected}>{cursor}</Text>
          <Text dimColor>[+] Add</Text>
        </Box>
      );
    }

    if (row.type === "action") {
      return (
        <Text color={cursorColor} bold={isSelected}>
          {cursor}{row.icon} {row.label}
        </Text>
      );
    }
    return null;
  };

  return (
    <Box width={width} height={height} borderStyle="round" flexDirection="column" paddingX={1}>
      <ScrollableRows
        items={rows}
        maxVisible={maxVisible}
        scrollOffset={scrollOffset}
        renderRow={renderRow}
        keyExtractor={(r) => r.rowKey}
        padEmpty={false}
      />
      <Box flexGrow={1} />
      <Box>
        <Text dimColor>
          {editing
            ? "Enter:save  Esc:cancel"
            : "j/k:nav  Enter:edit  a:add  d:del  Esc/Space:back"}
        </Text>
      </Box>
    </Box>
  );
}
