import React from "react";
import { Box, Text } from "ink";
import type { RepoInfo } from "../utils/types.js";

interface RepoListProps {
  repos: RepoInfo[];
  dimmed?: boolean;
  selectedIndex?: number; // 0-based within repos, undefined = no selection
}

export function RepoList({ repos, dimmed, selectedIndex }: RepoListProps) {
  const nameWidth = repos.length > 0
    ? Math.max(4, ...repos.map((r) => r.name.length))
    : 4;

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Section title */}
      <Text dimColor>
        {"  ── Repositories ────────────────────────────────────────────"}
      </Text>

      {/* Spacer between title and list */}
      <Text>{" "}</Text>

      {repos.length === 0 ? (
        <Box paddingX={2}>
          <Text dimColor>{"   No repositories. Press [a] to add one."}</Text>
        </Box>
      ) : (
        repos.map((repo, i) => {
          const selected = !dimmed && selectedIndex === i;
          const cursor = selected ? " > " : "   ";
          return (
            <Box key={repo.name}>
              <Text color={selected ? "cyan" : undefined} bold={selected} dimColor={dimmed}>
                {cursor}
              </Text>
              <Text color={repo.tmuxAlive ? "green" : undefined} dimColor={dimmed && !repo.tmuxAlive}>
                {repo.tmuxAlive ? "● " : "  "}
              </Text>
              <Text color={selected ? "cyan" : undefined} bold={selected} dimColor={dimmed}>
                {repo.name.padEnd(nameWidth)}
                {"  "}
                {repo.repoRoot}
              </Text>
            </Box>
          );
        })
      )}
    </Box>
  );
}
