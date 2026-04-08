import React from "react";
import { Box, Text } from "ink";
import { ScrollableRows } from "./ScrollableRows.js";
import type { LogFileInfo } from "../utils/types.js";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface LogListProps {
  logs: LogFileInfo[];
  dimmed?: boolean;
  selectedIndex?: number;
  maxVisible: number;
  scrollOffset: number;
}

export function LogList({ logs, dimmed, selectedIndex, maxVisible, scrollOffset }: LogListProps) {
  const nameWidth = logs.length > 0
    ? Math.max(4, ...logs.map((l) => l.name.length))
    : 4;

  return (
    <Box flexDirection="column" paddingX={1}>
      {logs.length === 0 ? (
        <Box paddingX={2}>
          <Text dimColor>{"   (no log files)"}</Text>
        </Box>
      ) : (
        <>
          {/* Column header */}
          <Box>
            <Text dimColor>
              {`    ${"FILE".padEnd(nameWidth)}  SIZE`}
            </Text>
          </Box>
          <ScrollableRows
            items={logs}
            maxVisible={maxVisible - 1}
            scrollOffset={scrollOffset}
            keyExtractor={(log) => log.name}
            renderRow={(log, i) => {
              const selected = !dimmed && selectedIndex === i;
              const cursor = selected ? " > " : "   ";
              return (
                <Box>
                  <Text color={selected ? "cyan" : undefined} bold={selected} dimColor={dimmed}>
                    {cursor}
                    {log.name.padEnd(nameWidth)}
                    {"  "}
                    {formatFileSize(log.size)}
                  </Text>
                </Box>
              );
            }}
          />
        </>
      )}
    </Box>
  );
}
