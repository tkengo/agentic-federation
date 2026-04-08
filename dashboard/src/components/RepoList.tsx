import React from "react";
import { Box, Text } from "ink";
import { ScrollableRows } from "./ScrollableRows.js";
import { EmacsTextInput } from "./EmacsTextInput.js";
import type { RepoInfo } from "../utils/types.js";

interface RepoListProps {
  repos: RepoInfo[];
  dimmed?: boolean;
  selectedIndex?: number; // 0-based within repos, undefined = no selection
  maxVisible: number;
  scrollOffset: number;
  renamingRepo?: string | null;
  renameValue?: string;
  onRenameChange?: (value: string) => void;
  onRenameSubmit?: (value: string) => void;
}

export function RepoList({ repos, dimmed, selectedIndex, maxVisible, scrollOffset, renamingRepo, renameValue, onRenameChange, onRenameSubmit }: RepoListProps) {
  const nameWidth = repos.length > 0
    ? Math.max(4, ...repos.map((r) => r.name.length))
    : 4;

  return (
    <Box flexDirection="column" paddingX={1}>
      {repos.length === 0 ? (
        <Box paddingX={2}>
          <Text dimColor>{"   No repositories. Press [a] to add one."}</Text>
        </Box>
      ) : (
        <>
          {/* Column header */}
          <Box>
            <Text dimColor>
              {`     ${"NAME".padEnd(nameWidth)}  PATH`}
            </Text>
          </Box>
          <ScrollableRows
          items={repos}
          maxVisible={maxVisible - 1}
          scrollOffset={scrollOffset}
          keyExtractor={(repo) => repo.name}
          renderRow={(repo, i) => {
            const selected = !dimmed && selectedIndex === i;
            const cursor = selected ? " > " : "   ";
            const isRenaming = renamingRepo === repo.name;
            return (
              <Box>
                <Text color={selected ? "cyan" : undefined} bold={selected} dimColor={dimmed}>
                  {cursor}
                </Text>
                <Text color={repo.tmuxAlive ? "green" : undefined} dimColor={dimmed && !repo.tmuxAlive}>
                  {repo.tmuxAlive ? "\u25CF " : "  "}
                </Text>
                {isRenaming ? (
                  <>
                    <EmacsTextInput
                      value={renameValue ?? ""}
                      onChange={onRenameChange ?? (() => {})}
                      onSubmit={onRenameSubmit}
                      focus={true}
                    />
                    <Text dimColor>
                      {"  "}
                      {repo.repoRoot}
                    </Text>
                  </>
                ) : (
                  <Text color={selected ? "cyan" : undefined} bold={selected} dimColor={dimmed}>
                    {repo.name.padEnd(nameWidth)}
                    {"  "}
                    {repo.repoRoot}
                  </Text>
                )}
              </Box>
            );
          }}
          />
        </>
      )}
    </Box>
  );
}
