import React, { useState, useMemo, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { PreviewPanel } from "./PreviewPanel.js";
import { RepoEditor } from "./RepoEditor.js";
import type { RepoConfigJson } from "./RepoEditor.js";
import { useFooter } from "../contexts/FooterContext.js";
import { shortenHome } from "../utils/format.js";
import { REPOS_DIR } from "../utils/types.js";
import type { RepoInfo } from "../utils/types.js";
import type { PreviewData } from "../hooks/usePreviewContent.js";

interface RepoDetailProps {
  repo: RepoInfo;
  columns: number;
  rows: number;
  headerHeight: number;
  refreshRepos: () => void;
  onBack: () => void;
}

export function RepoDetail({
  repo,
  columns,
  rows,
  headerHeight,
  refreshRepos,
  onBack,
}: RepoDetailProps) {
  const { showMessage, showError } = useFooter();

  // Bumped after each save to force config + preview re-read
  const [version, setVersion] = useState(0);

  // Preview scroll state
  const [previewScroll, setPreviewScroll] = useState(0);

  // Editor reports edit-mode so we can disable conflicting key bindings
  // (EmacsTextInput uses Ctrl+U for kill-line, which would otherwise also
  // scroll the preview).
  const [editorEditing, setEditorEditing] = useState(false);

  const configPath = path.join(REPOS_DIR, `${repo.name}.json`);

  // Read config from disk (re-runs when version bumps)
  const config: RepoConfigJson | null = useMemo(() => {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      // Spread first so unknown fields are preserved, then normalize typed fields
      return {
        ...parsed,
        repo_name: parsed.repo_name ?? repo.name,
        base_path: parsed.base_path ?? "",
        setup_scripts: Array.isArray(parsed.setup_scripts) ? parsed.setup_scripts : [],
        symlinks: Array.isArray(parsed.symlinks) ? parsed.symlinks : [],
        copy_files: Array.isArray(parsed.copy_files) ? parsed.copy_files : [],
      };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configPath, repo.name, version]);

  const previewData: PreviewData = useMemo(() => {
    try {
      const content = fs.readFileSync(configPath, "utf-8");
      return {
        title: `${repo.name}.json`,
        lines: content.split("\n").slice(0, 200),
        type: "script" as const,
      };
    } catch {
      return {
        title: `${repo.name}.json`,
        lines: ["(read error)"],
        type: "script" as const,
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configPath, repo.name, version]);

  const handleConfigSaved = useCallback(() => {
    setVersion((v) => v + 1);
    refreshRepos();
  }, [refreshRepos]);

  // Open config in nvim (kept as an action menu item)
  const openInNvim = useCallback(() => {
    try {
      execSync(`nvim '${configPath}'`, { stdio: "inherit" });
      if (process.stdin.isTTY && process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
      }
      process.stdout.write("\x1b[2J\x1b[H");
      handleConfigSaved();
    } catch {
      showError(`Failed to open ${repo.name}.json`);
    }
  }, [configPath, repo.name, showError, handleConfigSaved]);

  // Layout
  const contentWidth = columns - 4;
  const detailWidth = Math.max(52, Math.min(80, Math.floor(contentWidth * 0.55)));
  const previewWidth = Math.max(20, contentWidth - detailWidth - 1);
  const infoLines = 3; // name + repoRoot + blank
  const panelHeight = Math.max(6, rows - headerHeight - 2 - infoLines);

  // Preview scroll (Ctrl+U / Ctrl+D) — kept on the parent so it works
  // regardless of editor focus
  useInput(
    (input, key) => {
      const contentHeight = Math.max(1, panelHeight - 2);
      const maxScroll = Math.max(0, previewData.lines.length - contentHeight);
      if (key.ctrl && input === "u") {
        setPreviewScroll((s) => Math.max(0, s - contentHeight));
      } else if (key.ctrl && input === "d") {
        setPreviewScroll((s) => Math.min(maxScroll, s + contentHeight));
      }
    },
    { isActive: !editorEditing }
  );

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text bold color="cyan">{repo.name}</Text>
      <Text dimColor>{shortenHome(repo.repoRoot)}</Text>
      <Text>{" "}</Text>

      <Box flexDirection="row" height={panelHeight} gap={1}>
        {config ? (
          <RepoEditor
            configPath={configPath}
            config={config}
            width={detailWidth}
            height={panelHeight}
            active={true}
            onBack={onBack}
            onConfigSaved={handleConfigSaved}
            onOpenInNvim={openInNvim}
            onMessage={showMessage}
            onError={showError}
            onEditingChange={setEditorEditing}
          />
        ) : (
          <Box width={detailWidth} height={panelHeight} borderStyle="round" paddingX={1}>
            <Text color="red">Failed to read {repo.name}.json</Text>
          </Box>
        )}
        <PreviewPanel
          preview={previewData}
          width={previewWidth}
          height={panelHeight}
          scrollOffset={previewScroll}
        />
      </Box>
    </Box>
  );
}
