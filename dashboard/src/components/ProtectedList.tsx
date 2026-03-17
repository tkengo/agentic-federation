import React from "react";
import { Box, Text } from "ink";
import { ScrollableRows } from "./ScrollableRows.js";
import { shortenHome } from "../utils/format.js";
import type { ProtectedWorktreeData } from "../utils/types.js";

interface ProtectedListProps {
  worktrees: ProtectedWorktreeData[];
  dimmed?: boolean;
  selectedIndex?: number;
  maxVisible: number;
  scrollOffset: number;
}

export function ProtectedList({ worktrees, dimmed, selectedIndex, maxVisible, scrollOffset }: ProtectedListProps) {
  if (worktrees.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box paddingX={2}>
          <Text dimColor>{"   No protected worktrees."}</Text>
        </Box>
      </Box>
    );
  }

  // Calculate column widths
  const colWidths = {
    repoBranch: Math.max(11, ...worktrees.map((wt) =>
      `${wt.repo}/${wt.branch}`.length
    )),
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Column header */}
      <Box>
        <Text dimColor>
          {`    ${"REPO/BRANCH".padEnd(colWidths.repoBranch)}  PATH`}
        </Text>
      </Box>

      <ScrollableRows
        items={worktrees}
        maxVisible={maxVisible - 1}
        scrollOffset={scrollOffset}
        keyExtractor={(wt) => wt.path}
        renderRow={(wt, i) => {
          const selected = !dimmed && selectedIndex === i;
          const cursor = selected ? ">" : " ";
          const label = `${wt.repo}/${wt.branch}`;

          return (
            <Box>
              <Text color={selected ? "cyan" : undefined} bold={selected} dimColor={dimmed}>
                {` ${cursor} `}
              </Text>
              <Text color={selected ? "cyan" : undefined} bold={selected} dimColor={dimmed}>
                {label.padEnd(colWidths.repoBranch)}
              </Text>
              <Text dimColor={dimmed}>{`  `}</Text>
              <Text dimColor>{shortenHome(wt.path)}</Text>
            </Box>
          );
        }}
      />
    </Box>
  );
}
