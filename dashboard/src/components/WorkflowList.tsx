import React from "react";
import { Box, Text } from "ink";

interface WorkflowInfo {
  name: string;
  description: string;
}

interface WorkflowListProps {
  workflows: WorkflowInfo[];
  dimmed?: boolean;
}

export function WorkflowList({ workflows, dimmed }: WorkflowListProps) {
  const nameWidth = workflows.length > 0
    ? Math.max(4, ...workflows.map((w) => w.name.length))
    : 4;

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Section title */}
      <Text dimColor>
        {"  ── Workflows ───────────────────────────────────────────────"}
      </Text>

      {/* Spacer between title and list */}
      <Text>{" "}</Text>

      {workflows.length === 0 ? (
        <Box paddingX={2}>
          <Text dimColor>No workflows found.</Text>
        </Box>
      ) : (
        workflows.map((wf) => (
          <Box key={wf.name}>
            <Text dimColor={dimmed}>
              {"    "}
              {wf.name.padEnd(nameWidth)}
              {"  "}
              {wf.description}
            </Text>
          </Box>
        ))
      )}
    </Box>
  );
}
