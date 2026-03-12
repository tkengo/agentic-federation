import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { DetailPanel } from "./DetailPanel.js";
import { PreviewPanel } from "./PreviewPanel.js";
import { useKeyboard } from "../hooks/useKeyboard.js";
import { useFooter } from "../contexts/FooterContext.js";
import { shortenHome } from "../utils/format.js";
import { REPOS_DIR } from "../utils/types.js";
import type { RepoInfo } from "../utils/types.js";
import type { PreviewData } from "../hooks/usePreviewContent.js";
import type { ScriptEntry } from "./DetailPanel.js";

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
  const { showMessage } = useFooter();

  // Preview scroll state
  const [previewScroll, setPreviewScroll] = useState(0);

  // Config file path
  const configPath = path.join(REPOS_DIR, `${repo.name}.json`);

  // Read config file content for preview
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
  }, [configPath, repo.name]);

  const emptyScripts: ScriptEntry[] = [];

  // Open config in nvim
  const openConfig = () => {
    try {
      execSync(`nvim '${configPath}'`, { stdio: "inherit" });
      if (process.stdin.isTTY && process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
      }
      process.stdout.write("\x1b[2J\x1b[H");
      refreshRepos();
    } catch {
      showMessage(`Failed to open ${repo.name}.json`);
    }
  };

  // Keyboard: Enter=edit, Space/Esc=back
  useKeyboard({
    onEnter: openConfig,
    onSpace: onBack,
    onBack: onBack,
  }, true);

  // Preview scroll (Ctrl+U / Ctrl+D)
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
    { isActive: true }
  );

  // Layout calculations (same pattern as SessionDetail)
  const contentWidth = columns - 4;
  const detailWidth = Math.max(30, Math.min(55, Math.floor(contentWidth * 0.35)));
  const previewWidth = Math.max(20, contentWidth - detailWidth - 1);
  // info lines: repo name(1) + repoRoot(1) + blank(1)
  const infoLines = 3;
  const panelHeight = Math.max(5, rows - headerHeight - 2 - infoLines);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {/* Repo info */}
      <Text bold color="cyan">{repo.name}</Text>
      <Text dimColor>{shortenHome(repo.repoRoot)}</Text>
      <Text>{" "}</Text>

      {/* Detail + Preview panels */}
      <Box flexDirection="row" height={panelHeight} gap={1}>
        <DetailPanel
          width={detailWidth}
          height={panelHeight}
          mode="browse"
          scripts={emptyScripts}
          selectedIndex={0}
          maxVisible={Math.max(5, panelHeight - 2)}
        />
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
