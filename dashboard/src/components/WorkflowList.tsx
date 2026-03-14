import React from "react";
import { Box, Text } from "ink";
import { ScrollableRows } from "./ScrollableRows.js";

interface WorkflowInfo {
  name: string;
  description: string;
}

interface WorkflowListProps {
  workflows: WorkflowInfo[];
  dimmed?: boolean;
  maxVisible: number;
  scrollOffset: number;
}

export function WorkflowList({ workflows, dimmed, maxVisible, scrollOffset }: WorkflowListProps) {
  const nameWidth = workflows.length > 0
    ? Math.max(4, ...workflows.map((w) => w.name.length))
    : 4;

  return (
    <Box flexDirection="column" paddingX={1}>
      {workflows.length === 0 ? (
        <Box paddingX={2}>
          <Text dimColor>No workflows found.</Text>
        </Box>
      ) : (
        <ScrollableRows
          items={workflows}
          maxVisible={maxVisible}
          scrollOffset={scrollOffset}
          keyExtractor={(wf) => wf.name}
          renderRow={(wf) => (
            <Box>
              <Text dimColor={dimmed}>
                {"    "}
                {wf.name.padEnd(nameWidth)}
                {"  "}
                {wf.description}
              </Text>
            </Box>
          )}
        />
      )}
    </Box>
  );
}
