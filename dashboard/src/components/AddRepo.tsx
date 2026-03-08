import React, { useState, useMemo, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { EmacsTextInput } from "./EmacsTextInput.js";

// Duplicate parseCloneUrl locally (dashboard avoids cross-package imports)
function parseCloneUrl(url: string): string {
  // SSH: git@github.com:user/repo.git
  const sshMatch = url.match(/[:\/]([^/]+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1]!;
  return "";
}

// Derive repo name from a local path basename (strip leading dot)
function repoNameFromPath(repoPath: string): string {
  if (!repoPath.trim()) return "";
  return path.basename(repoPath.trim()).replace(/^\./, "");
}

const DEFAULT_BASE_PATH = "~/fed/repos";

type Mode = "select" | "clone" | "local";

interface AddRepoProps {
  onSubmitClone: (cloneUrl: string, basePath: string) => void;
  onSubmitLocal: (repoPath: string, basePath: string) => void;
  onCancel: () => void;
}

// --- Mode selection screen ---
function ModeSelect({ onSelect, onCancel }: {
  onSelect: (mode: "clone" | "local") => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const options: Array<{ key: "clone" | "local"; label: string; desc: string }> = [
    { key: "clone", label: "Clone", desc: "Clone from remote URL" },
    { key: "local", label: "Local", desc: "Use existing local repo" },
  ];

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    } else if (key.upArrow || (input === "p" && key.ctrl)) {
      setSelected((s) => (s <= 0 ? options.length - 1 : s - 1));
    } else if (key.downArrow || (input === "n" && key.ctrl)) {
      setSelected((s) => (s >= options.length - 1 ? 0 : s + 1));
    } else if (key.return) {
      onSelect(options[selected]!.key);
    }
  }, { isActive: true });

  return (
    <Box flexDirection="column">
      <Box paddingX={1}>
        <Text dimColor>Add Repository</Text>
      </Box>
      <Box
        flexDirection="column"
        borderStyle="single"
        marginX={1}
        paddingY={0}
      >
        {options.map((opt, i) => (
          <Box key={opt.key} marginLeft={2}>
            <Text color={i === selected ? "cyan" : undefined} bold={i === selected}>
              {i === selected ? "\u25B8 " : "  "}
              {opt.label}
            </Text>
            <Text dimColor>{"  "}{opt.desc}</Text>
          </Box>
        ))}
      </Box>
      <Text>{" "}</Text>
    </Box>
  );
}

// --- Clone form (existing behavior) ---
function CloneForm({ onSubmit, onBack }: {
  onSubmit: (cloneUrl: string, basePath: string) => void;
  onBack: () => void;
}) {
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
      onBack();
    } else if (key.tab) {
      setFocusField((f) => f === "url" ? "base" : "url");
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
      <Box paddingX={1}>
        <Text dimColor>Add Repository &gt; Clone</Text>
      </Box>
      <Box
        flexDirection="column"
        borderStyle="single"
        marginX={1}
        paddingY={0}
      >
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

// Resolve a path string: expand ~/ and make absolute
function resolvePath(p: string): string {
  const trimmed = p.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("~/")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return path.resolve(trimmed);
}

// Debounced git repo name detection hook.
// Returns basename immediately, then overrides with git remote name after debounce.
function useGitRepoName(repoPath: string, debounceMs = 400): string {
  const basenameName = useMemo(() => repoNameFromPath(repoPath), [repoPath]);
  const [gitName, setGitName] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const resolved = resolvePath(repoPath);
    if (!resolved) {
      setGitName("");
      return;
    }

    timerRef.current = setTimeout(() => {
      try {
        const remoteUrl = execSync(
          `git -C '${resolved}' remote get-url origin 2>/dev/null`,
          { encoding: "utf-8" }
        ).trim();
        if (remoteUrl) {
          const parsed = parseCloneUrl(remoteUrl);
          if (parsed) {
            setGitName(parsed);
            return;
          }
        }
      } catch {
        // No remote or not a git repo
      }
      setGitName("");
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [repoPath, debounceMs]);

  // git result takes priority when available, otherwise basename
  return gitName || basenameName;
}

// --- Local form (new) ---
function LocalForm({ onSubmit, onBack }: {
  onSubmit: (repoPath: string, basePath: string) => void;
  onBack: () => void;
}) {
  const [repoPath, setRepoPath] = useState("");
  const [basePath, setBasePath] = useState(DEFAULT_BASE_PATH);
  const [focusField, setFocusField] = useState<"path" | "base">("path");
  const [error, setError] = useState("");

  const repoName = useGitRepoName(repoPath);
  const worktreeBase = repoName
    ? `${basePath}/${repoName}-workspace`
    : "";

  useInput((input, key) => {
    if (key.escape) {
      onBack();
    } else if (key.tab) {
      setFocusField((f) => f === "path" ? "base" : "path");
    }
  }, { isActive: true });

  const handleSubmit = () => {
    const trimmed = repoPath.trim();
    if (!trimmed) {
      setError("Repo path is required");
      return;
    }
    if (!repoName) {
      setError("Cannot determine repo name from path");
      return;
    }
    // Validate directory exists
    const resolved = resolvePath(trimmed);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      setError("Directory does not exist: " + resolved);
      return;
    }
    // Validate .git exists (directory for normal repos, file for worktrees)
    if (!fs.existsSync(path.join(resolved, ".git"))) {
      setError("Not a git repository (no .git found): " + resolved);
      return;
    }
    setError("");
    onSubmit(trimmed, basePath.trim());
  };

  return (
    <Box flexDirection="column">
      <Box paddingX={1}>
        <Text dimColor>Add Repository &gt; Local</Text>
      </Box>
      <Box
        flexDirection="column"
        borderStyle="single"
        marginX={1}
        paddingY={0}
      >
        <Box marginLeft={2}>
          <Text bold color={focusField === "path" ? "cyan" : undefined}>
            {"Repo Path: "}
          </Text>
          <EmacsTextInput
            value={repoPath}
            onChange={(val) => { setRepoPath(val); setError(""); }}
            onSubmit={handleSubmit}
            focus={focusField === "path"}
            placeholder="~/.dotfiles"
          />
        </Box>
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
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          <Text dimColor>
            {"Repo name:     "}
            {repoName ? <Text color="green">{repoName}</Text> : <Text dimColor>-</Text>}
          </Text>
          <Text dimColor>
            {"Worktree base: "}
            {worktreeBase || "-"}
          </Text>
        </Box>
      </Box>
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

// --- Main AddRepo component with mode selection ---
export function AddRepo({ onSubmitClone, onSubmitLocal, onCancel }: AddRepoProps) {
  const [mode, setMode] = useState<Mode>("select");

  if (mode === "select") {
    return <ModeSelect onSelect={setMode} onCancel={onCancel} />;
  }
  if (mode === "clone") {
    return <CloneForm onSubmit={onSubmitClone} onBack={() => setMode("select")} />;
  }
  return <LocalForm onSubmit={onSubmitLocal} onBack={() => setMode("select")} />;
}
