import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { EmacsTextInput } from "./EmacsTextInput.js";

// Duplicate parseCloneUrl locally (dashboard avoids cross-package imports)
function parseCloneUrl(url: string): string {
  // SSH: git@github.com:user/repo.git
  const sshMatch = url.match(/[:\/]([^/]+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1]!;
  return "";
}

const DEFAULT_BASE_PATH = "~/fed/repos";

interface AddRepoProps {
  onSubmit: (cloneUrl: string, basePath: string) => void;
  onCancel: () => void;
}

export function AddRepo({ onSubmit, onCancel }: AddRepoProps) {
  const [cloneUrl, setCloneUrl] = useState("");
  const [basePath, setBasePath] = useState(DEFAULT_BASE_PATH);
  const [focusField, setFocusField] = useState<"url" | "base">("url");
  const [error, setError] = useState("");

  const repoName = useMemo(() => parseCloneUrl(cloneUrl), [cloneUrl]);
  const workspacePath = repoName
    ? `${basePath}/${repoName}-workspace`
    : "";
  const cloneDest = repoName
    ? `${basePath}/${repoName}-workspace/main`
    : "";

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    } else if (key.tab) {
      setFocusField((f) => f === "url" ? "base" : "url");
    } else if (key.return) {
      // Only handle Enter when not in an EmacsTextInput submit
      // The submit is handled via onSubmit on EmacsTextInput
    }
  }, { isActive: true });

  const handleSubmit = () => {
    const trimmedUrl = cloneUrl.trim();
    if (!trimmedUrl) {
      setError("Clone URL is required");
      return;
    }
    if (!repoName) {
      setError("Cannot extract repo name from URL");
      return;
    }
    setError("");
    onSubmit(trimmedUrl, basePath.trim());
  };

  return (
    <Box flexDirection="column">
      {/* Breadcrumb */}
      <Box paddingX={1}>
        <Text dimColor>Add Repository</Text>
      </Box>

      {/* Panel */}
      <Box
        flexDirection="column"
        borderStyle="single"
        marginX={1}
        paddingY={0}
      >
        {/* Clone URL field */}
        <Box marginLeft={2}>
          <Text bold color={focusField === "url" ? "cyan" : undefined}>
            {"Clone URL: "}
          </Text>
          <EmacsTextInput
            value={cloneUrl}
            onChange={(val) => { setCloneUrl(val); setError(""); }}
            onSubmit={handleSubmit}
            focus={focusField === "url"}
            placeholder="git@github.com:user/repo.git"
          />
        </Box>

        {/* Base Path field */}
        <Box marginLeft={2}>
          <Text bold color={focusField === "base" ? "cyan" : undefined}>
            {"Base Path: "}
          </Text>
          <EmacsTextInput
            value={basePath}
            onChange={(val) => { setBasePath(val); setError(""); }}
            onSubmit={handleSubmit}
            focus={focusField === "base"}
          />
        </Box>

        {/* Preview section */}
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          <Text dimColor>
            {"Repo name:  "}
            {repoName ? <Text color="green">{repoName}</Text> : <Text dimColor>-</Text>}
          </Text>
          <Text dimColor>
            {"Workspace:  "}
            {workspacePath || "-"}
          </Text>
          <Text dimColor>
            {"Clone dest: "}
            {cloneDest || "-"}
          </Text>
        </Box>
      </Box>

      {/* Error / spacing */}
      {error ? (
        <Box marginLeft={2}>
          <Text color="red">{error}</Text>
        </Box>
      ) : (
        <Text>{" "}</Text>
      )}
    </Box>
  );
}
