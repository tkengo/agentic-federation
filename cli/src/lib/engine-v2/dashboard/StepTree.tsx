import React, { useMemo } from "react";
import { Text, Box } from "ink";
import type { StepNode } from "./types.js";
import { StepRow, computeColumnWidths } from "./StepRow.js";

interface StepTreeProps {
  steps: StepNode[];
  selectedIndex: number;
  spinnerFrame: number;
  maxHeight: number;
}

export function StepTree({ steps, selectedIndex, spinnerFrame, maxHeight }: StepTreeProps): React.ReactElement {
  // Viewport scrolling: keep selected item visible
  const visibleCount = Math.max(1, maxHeight - 2); // account for header
  let startIndex = 0;
  if (selectedIndex >= visibleCount) {
    startIndex = selectedIndex - visibleCount + 1;
  }
  const visibleSteps = steps.slice(startIndex, startIndex + visibleCount);

  // Compute fixed column widths across all steps (not just visible)
  const columnWidths = useMemo(() => computeColumnWidths(steps), [steps]);

  // Pad with empty lines to keep fixed height and prevent flicker
  const padCount = visibleCount - visibleSteps.length;

  return (
    <Box flexDirection="column" height={maxHeight}>
      <Box>
        <Text bold color="white"> Steps</Text>
        <Text dimColor>{"  [↑↓ to navigate]"}</Text>
      </Box>
      {visibleSteps.map((node, i) => (
        <StepRow
          key={node.stepPath}
          node={node}
          selected={startIndex + i === selectedIndex}
          spinnerFrame={spinnerFrame}
          columnWidths={columnWidths}
        />
      ))}
      {padCount > 0 && Array.from({ length: padCount }, (_, i) => (
        <Text key={`pad-${i}`}>{" "}</Text>
      ))}
    </Box>
  );
}
