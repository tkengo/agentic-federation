import React from "react";
import { Box, Text } from "ink";
import type { RepoInfo } from "../utils/types.js";

interface RepoListProps {
  repos: RepoInfo[];
  dimmed?: boolean;
}

export function RepoList({ repos, dimmed }: RepoListProps) {
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
          <Text dimColor>No repositories. Press [a] to add one.</Text>
        </Box>
      ) : (
        repos.map((repo) => (
          <Box key={repo.name}>
            <Text dimColor={dimmed}>
              {"    "}
              {repo.name.padEnd(nameWidth)}
              {"  "}
              {repo.repoRoot}
            </Text>
          </Box>
        ))
      )}
    </Box>
  );
}
