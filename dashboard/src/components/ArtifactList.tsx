import React, { useMemo } from "react";
import { Box, Text } from "ink";
import fs from "node:fs";
import path from "node:path";

interface ArtifactListProps {
  sessionDir: string;
  selectedIndex: number;
  description?: string;
  colWidths: {
    repoBranch: number;
    workflow: number;
    status: number;
  };
}

export interface ArtifactEntry {
  name: string;
  sizeKB: string;
}

function formatKB(bytes: number): string {
  const kb = bytes / 1024;
  if (kb < 0.1) return "0.1KB";
  if (kb < 10) return `${kb.toFixed(1)}KB`;
  return `${Math.round(kb)}KB`;
}

export function useArtifacts(sessionDir: string): ArtifactEntry[] {
  return useMemo(() => {
    const dir = path.join(sessionDir, "artifacts");
    try {
      if (!fs.existsSync(dir)) return [];
      return fs
        .readdirSync(dir)
        .filter((f) => {
          try {
            return fs.statSync(path.join(dir, f)).isFile();
          } catch {
            return false;
          }
        })
        .sort()
        .map((f) => {
          const stat = fs.statSync(path.join(dir, f));
          return { name: f, sizeKB: formatKB(stat.size) };
        });
    } catch {
      return [];
    }
  }, [sessionDir]);
}

const DESC_EXPANDED_MAX_LINES = 3;

// Truncate text to fit within maxLines of the given width
function truncateLines(text: string, lineWidth: number, maxLines: number): string {
  const maxChars = lineWidth * maxLines;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + "\u2026";
}

export function ArtifactList({ sessionDir, selectedIndex, description, colWidths }: ArtifactListProps) {
  const artifacts = useArtifacts(sessionDir);

  // Box width: cursor visual width is 4 (space + arrow(2) + space), minus marginLeft(4)
  // then repoBranch + 2 + workflow + 2 + status + 2 + [!](4) + 2 + age(4)
  const boxWidth = 3 + colWidths.repoBranch + 2 + colWidths.workflow + 2 + colWidths.status + 2 + 4 + 2 + 4;
  // Inner width accounts for border (2 chars) and padding (2 chars)
  const innerWidth = boxWidth - 4;

  const hasContent = description || artifacts.length > 0;

  if (!hasContent) {
    return (
      <Box marginLeft={4} width={boxWidth} borderStyle="round" flexDirection="column" paddingX={1}>
        <Text dimColor>(no artifacts)</Text>
      </Box>
    );
  }

  const truncatedDesc = description ? truncateLines(description, innerWidth, DESC_EXPANDED_MAX_LINES) : null;

  return (
    <Box marginLeft={3} width={boxWidth} borderStyle="round" flexDirection="column" paddingX={1}>
      {truncatedDesc && (
        <Box width={innerWidth} marginBottom={artifacts.length > 0 ? 1 : 0}>
          <Text>{truncatedDesc}</Text>
        </Box>
      )}
      {artifacts.length > 0 && (
        <>
          <Box marginTop={-1} marginLeft={1}>
            <Text dimColor> Artifacts </Text>
          </Box>
          {artifacts.map((a, i) => {
            const selected = i === selectedIndex;
            const cursor = selected ? "> " : "  ";
            const nameWidth = innerWidth - 2 - a.sizeKB.length - 1;
            const displayName = a.name.length > nameWidth
              ? a.name.slice(0, nameWidth - 1) + "\u2026"
              : a.name.padEnd(nameWidth);
            return (
              <Box key={a.name}>
                <Text color={selected ? "cyan" : undefined} bold={selected}>
                  {cursor}{displayName} {a.sizeKB}
                </Text>
              </Box>
            );
          })}
        </>
      )}
    </Box>
  );
}
