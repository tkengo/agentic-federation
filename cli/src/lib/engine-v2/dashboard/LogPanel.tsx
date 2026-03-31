import React from "react";
import { Text, Box } from "ink";

interface LogPanelProps {
  stepPath: string;
  stepLabel: string;
  lines: string[];
  maxHeight: number;
}

export function LogPanel({ stepPath, stepLabel, lines, maxHeight }: LogPanelProps): React.ReactElement {
  const headerHeight = 1;
  const visibleLines = Math.max(1, maxHeight - headerHeight);

  // Show tail of log (auto-scroll to bottom)
  const startLine = Math.max(0, lines.length - visibleLines);
  const visible = lines.slice(startLine, startLine + visibleLines);

  // Pad with empty lines to keep fixed height and prevent flicker
  const padCount = visibleLines - visible.length;

  const separator = `─── ${stepLabel} ───`;

  return (
    <Box flexDirection="column" height={maxHeight}>
      <Text bold dimColor>{separator}</Text>
      {visible.length === 0 ? (
        <Text dimColor>{"  (no output)"}</Text>
      ) : (
        visible.map((line, i) => (
          <Text key={startLine + i} wrap="truncate">{"  "}{colorize(line)}</Text>
        ))
      )}
      {padCount > 1 && Array.from({ length: padCount - (visible.length === 0 ? 1 : 0) }, (_, i) => (
        <Text key={`pad-${i}`}>{" "}</Text>
      ))}
    </Box>
  );
}

/**
 * Apply basic color styling based on line content.
 */
function colorize(line: string): React.ReactElement {
  if (line.startsWith("✓")) return <Text color="green">{line}</Text>;
  if (line.startsWith("✗")) return <Text color="red">{line}</Text>;
  if (line.startsWith("◌")) return <Text color="yellow">{line}</Text>;
  if (line.startsWith("▶")) return <Text color="cyan">{line}</Text>;
  if (line.startsWith("⚠")) return <Text color="yellow">{line}</Text>;
  if (line.includes("🔧")) return <Text color="gray">{line}</Text>;
  return <Text>{line}</Text>;
}
