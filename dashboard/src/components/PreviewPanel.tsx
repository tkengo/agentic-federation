import React from "react";
import { Box, Text } from "ink";
import type { PreviewData } from "../hooks/usePreviewContent.js";

const ICON_MAP: Record<PreviewData["type"], string> = {
  artifact: "\u{1F4C4}",  // 📄
  script: "\u{1F4DC}",    // 📜
  pane: "\u{1F4BB}",      // 💻
  none: "",
};

interface PreviewPanelProps {
  preview: PreviewData;
  width: number;
  height: number;
  scrollOffset: number;
}

export function PreviewPanel({ preview, width, height, scrollOffset }: PreviewPanelProps) {
  if (preview.type === "none") {
    return (
      <Box
        width={width}
        height={height}
        borderStyle="round"
        flexDirection="column"
        paddingX={1}
      >
        <Text dimColor>(no preview)</Text>
      </Box>
    );
  }

  const icon = ICON_MAP[preview.type];
  const innerWidth = width - 4; // border(2) + paddingX(2)
  // Content area: total height - border(2) - title(1) - separator(1)
  const contentHeight = Math.max(1, height - 4);
  // Pane preview: always show the bottom (tail -f style), no scroll
  const isPane = preview.type === "pane";
  const visibleLines = isPane
    ? preview.lines.slice(Math.max(0, preview.lines.length - contentHeight))
    : preview.lines.slice(scrollOffset, scrollOffset + contentHeight);
  const hasMoreUp = isPane ? false : scrollOffset > 0;
  const hasMoreDown = isPane ? false : scrollOffset + contentHeight < preview.lines.length;

  return (
    <Box
      width={width}
      height={height}
      borderStyle="round"
      flexDirection="column"
      paddingX={1}
    >
      {/* Title */}
      <Box>
        <Text bold>{icon} {preview.title}</Text>
        {preview.type === "pane" && (
          <Text dimColor> [live]</Text>
        )}
      </Box>
      {/* Separator */}
      <Text dimColor>{"\u2500".repeat(Math.max(0, innerWidth))}</Text>
      {/* Content lines */}
      {visibleLines.map((line, i) => {
        const isFirst = i === 0;
        const isLast = i === visibleLines.length - 1;
        const indicator = (isFirst && hasMoreUp)
          ? " \u25B2"
          : (isLast && hasMoreDown)
            ? " \u25BC"
            : "";
        const maxLen = innerWidth - (indicator ? 2 : 0);
        const truncated = line.length > maxLen
          ? line.slice(0, maxLen - 1) + "\u2026"
          : line;
        return (
          <Box key={`pv-${scrollOffset}-${i}`}>
            <Box flexGrow={1}>
              <Text>{truncated || " "}</Text>
            </Box>
            {indicator && <Text dimColor>{indicator}</Text>}
          </Box>
        );
      })}
      {/* Pad remaining lines to keep height stable */}
      {Array.from(
        { length: Math.max(0, contentHeight - visibleLines.length) },
        (_, i) => (
          <Text key={`pad-${i}`}>{" "}</Text>
        )
      )}
    </Box>
  );
}
