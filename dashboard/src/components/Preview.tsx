import React from "react";
import fs from "node:fs";
import path from "node:path";
import { Box, Text } from "ink";
import { ARTIFACT_MAP, STATUS_PREVIEW_MAP } from "../utils/types.js";
import type { SessionData } from "../utils/types.js";

interface PreviewProps {
  session: SessionData;
  maxHeight?: number;
}

export function Preview({ session, maxHeight = 30 }: PreviewProps) {
  const artifactNames = STATUS_PREVIEW_MAP[session.status];

  if (!artifactNames || artifactNames.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text dimColor>
          No preview available for status: {session.status}
        </Text>
      </Box>
    );
  }

  const contents: Array<{ name: string; content: string }> = [];
  for (const name of artifactNames) {
    const relPath = ARTIFACT_MAP[name];
    if (!relPath) continue;

    const filePath = path.join(session.sessionDir, relPath);
    if (!fs.existsSync(filePath)) continue;

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      contents.push({ name, content });
    } catch {
      // Skip unreadable files
    }
  }

  if (contents.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text dimColor>
          Artifacts not yet created for status: {session.status}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {contents.map(({ name, content }) => {
        // Truncate content to maxHeight lines
        const lines = content.split("\n");
        const truncated = lines.slice(0, maxHeight);
        const displayContent = truncated.join("\n");
        const hasMore = lines.length > maxHeight;

        return (
          <Box key={name} flexDirection="column" marginBottom={1}>
            <Text bold color="cyan">
              --- {name} ---
            </Text>
            <Text>{displayContent}</Text>
            {hasMore && (
              <Text dimColor>
                ... ({lines.length - maxHeight} more lines)
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
