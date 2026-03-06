import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import fs from "node:fs";
import { execSync, spawnSync, spawn } from "node:child_process";
import { SessionList } from "./SessionList.js";
import { RepoList } from "./RepoList.js";
import { WorkflowList } from "./WorkflowList.js";
import { useKeyboard } from "../hooks/useKeyboard.js";
import { useFooter } from "../contexts/FooterContext.js";
import { switchToTmuxSession } from "../utils/tmux.js";
import type { SessionData, RepoInfo, WorkflowInfo } from "../utils/types.js";

interface HomeProps {
  sessions: SessionData[];
  repos: RepoInfo[];
  workflows: WorkflowInfo[];
  cleanableCount: number;
  active: boolean;
  columns: number;
  rows: number;
  refresh: () => void;
  refreshRepos: () => void;
  onNavigate: (target: "create" | "palette" | "add-repo") => void;
  onDetailSession: (sessionName: string) => void;
  onDetailRepo: (repoName: string) => void;
  onSelectedSessionChange: (session: SessionData | undefined) => void;
  pendingAction: string | null;
  onActionHandled: () => void;
}

export function Home({
  sessions,
  repos,
  workflows,
  cleanableCount,
  active,
  columns,
  rows,
  refresh,
  refreshRepos,
  onNavigate,
  onDetailSession,
  onDetailRepo,
  onSelectedSessionChange,
  pendingAction,
  onActionHandled,
}: HomeProps) {
  const { showMessage, showError, setOverride, clearOverride } = useFooter();

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmingKill, setConfirmingKill] = useState(false);
  const [confirmingClean, setConfirmingClean] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  // Navigation: sessions -> clean row -> repos
  const hasCleanRow = cleanableCount > 0;
  const cleanOffset = hasCleanRow ? 1 : 0;
  const repoStartIndex = sessions.length + cleanOffset;
  const totalItems = sessions.length + cleanOffset + repos.length;
  const maxIndex = Math.max(0, totalItems - 1);
  const cleanRowSelected = hasCleanRow && selectedIndex === sessions.length;
  const isRepoSelected = selectedIndex >= repoStartIndex && selectedIndex < repoStartIndex + repos.length;
  const selectedRepoIndex = isRepoSelected ? selectedIndex - repoStartIndex : -1;
  const selectedSession: SessionData | undefined = sessions[selectedIndex];

  // Clamp selectedIndex if list changed
  if (selectedIndex > maxIndex && maxIndex >= 0) {
    setSelectedIndex(maxIndex);
  }

  // Report selected session to parent
  useEffect(() => {
    onSelectedSessionChange(selectedSession);
  }, [selectedSession, onSelectedSessionChange]);

  // Report footer override to parent
  useEffect(() => {
    if (cleaning) {
      setOverride({ type: "cleaning" });
    } else if (confirmingClean) {
      setOverride({ type: "confirmClean", count: cleanableCount });
    } else if (confirmingKill && selectedSession) {
      setOverride({ type: "confirmKill", name: selectedSession.name });
    } else {
      clearOverride();
    }
  }, [cleaning, confirmingClean, confirmingKill, cleanableCount, selectedSession, setOverride, clearOverride]);

  // Clear footer override on unmount
  useEffect(() => {
    return () => {
      clearOverride();
    };
  }, [clearOverride]);

  // Switch to tmux session
  const switchToSession = useCallback(() => {
    if (!selectedSession) return;
    const target = selectedSession.meta.tmux_session;
    const ok = switchToTmuxSession(target);
    if (ok) {
      showMessage(`Detached from ${selectedSession.name}`);
    } else {
      showMessage(`Failed to switch to ${selectedSession.name}`);
    }
  }, [selectedSession, showMessage]);

  // Kill session
  const killSession = useCallback(() => {
    if (!selectedSession) return;
    try {
      execSync(`fed stop '${selectedSession.name}'`, { stdio: "ignore" });
      showMessage(`Stopped: ${selectedSession.name}`);
      refresh();
    } catch {
      showMessage(`Failed to stop ${selectedSession.name}`);
    }
  }, [selectedSession, showMessage, refresh]);

  // Archive session
  const archiveSession = useCallback(() => {
    if (!selectedSession) return;
    try {
      execSync(`fed archive '${selectedSession.name}'`, { stdio: "ignore" });
      showMessage(`Archived: ${selectedSession.name}`);
      refresh();
    } catch {
      showMessage(`Failed to archive ${selectedSession.name}`);
    }
  }, [selectedSession, showMessage, refresh]);

  // Archive all completed sessions
  const archiveAllCompleted = useCallback(() => {
    try {
      const output = execSync("fed archive --completed", { encoding: "utf-8" });
      const count = (output.match(/Archived/g) ?? []).length;
      showMessage(count > 0 ? `Archived ${count} sessions` : "No completed sessions to archive");
      refresh();
    } catch {
      showMessage("Failed to archive completed sessions");
    }
  }, [showMessage, refresh]);

  // Run fed clean (async via spawn)
  const runClean = useCallback((force?: boolean) => {
    setCleaning(true);
    setOverride({ type: "cleaning" });

    const args = force ? ["clean", "--force"] : ["clean"];
    const proc = spawn("fed", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      setCleaning(false);
      clearOverride();
      const doneLine = stdout.match(/^Done\. (.+)$/m);
      if (code === 0) {
        showMessage(doneLine ? doneLine[1]! : "Cleaned worktrees");
      } else {
        if (doneLine) {
          showMessage(doneLine[1]!);
        } else {
          showError(stderr.trim() || "Failed to clean worktrees");
        }
      }
      refresh();
    });

    proc.on("error", () => {
      setCleaning(false);
      clearOverride();
      showError("Failed to clean worktrees");
      refresh();
    });
  }, [refresh, setOverride, clearOverride, showMessage, showError]);

  // Open shell at repo root directory
  const openRepoShell = useCallback((repoIndex: number) => {
    const repo = repos[repoIndex];
    if (!repo) return;
    if (!fs.existsSync(repo.repoRoot)) {
      showError(`Directory not found: ${repo.repoRoot}`);
      return;
    }
    const shell = process.env.SHELL || "/bin/sh";
    // Save Ink's terminal settings (stdin must be inherited so stty sees the real tty)
    const sttyResult = spawnSync("stty", ["-g"], {
      stdio: ["inherit", "pipe", "pipe"],
      encoding: "utf-8",
    });
    const savedStty = sttyResult.stdout.trim();
    // Show cursor and clear screen before spawning shell
    process.stdout.write("\x1b[?25h\x1b[2J\x1b[H");
    spawnSync(shell, [], { stdio: "inherit", cwd: repo.repoRoot });
    // Restore Ink's terminal settings (stty needs real tty on stdin)
    if (savedStty) {
      spawnSync("stty", [savedStty], { stdio: "inherit" });
    }
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdout.write("\x1b[?25l\x1b[2J\x1b[H");
  }, [repos, showMessage, showError]);

  // Handle pending actions from CommandPalette
  useEffect(() => {
    if (!pendingAction) return;
    switch (pendingAction) {
      case "attach":
        switchToSession();
        break;
      case "stop":
        killSession();
        break;
      case "clean":
        runClean();
        break;
      case "archive":
        archiveSession();
        break;
      case "archive-completed":
        archiveAllCompleted();
        break;
    }
    onActionHandled();
  }, [pendingAction, onActionHandled, switchToSession, killSession, runClean, archiveSession, archiveAllCompleted]);

  // --- Keyboard handlers ---

  // List screen keyboard bindings
  useKeyboard(
    {
      onUp: () => {
        setSelectedIndex((i) => Math.max(0, i - 1));
      },
      onDown: () => {
        setSelectedIndex((i) => Math.min(maxIndex, i + 1));
      },
      onEnter: () => {
        if (cleanRowSelected) {
          setConfirmingClean(true);
        } else if (isRepoSelected) {
          openRepoShell(selectedRepoIndex);
        } else if (selectedSession) {
          switchToSession();
        }
      },
      onStop: () => {
        if (selectedSession) setConfirmingKill(true);
      },
      onCreate: () => {
        onNavigate("create");
      },
      onPalette: () => {
        onNavigate("palette");
      },
      onAddRepo: () => {
        onNavigate("add-repo");
      },
      onSpace: () => {
        if (selectedSession) {
          onDetailSession(selectedSession.name);
        } else if (isRepoSelected) {
          onDetailRepo(repos[selectedRepoIndex]!.name);
        }
      },
    },
    active && !confirmingKill && !confirmingClean
  );

  // Kill confirmation handler
  useInput(
    (_input) => {
      if (_input === "y" || _input === "Y") {
        killSession();
        setConfirmingKill(false);
      } else {
        setConfirmingKill(false);
      }
    },
    { isActive: active && confirmingKill }
  );

  // Clean confirmation handler
  useInput(
    (_input) => {
      if (_input === "y" || _input === "Y") {
        setConfirmingClean(false);
        runClean();
      } else if (_input === "f" || _input === "F") {
        setConfirmingClean(false);
        runClean(true);
      } else {
        setConfirmingClean(false);
      }
    },
    { isActive: active && confirmingClean }
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      <SessionList
        sessions={sessions}
        selectedIndex={selectedIndex}
        dimmed={!active}
      />
      {hasCleanRow && (
        <Box paddingX={1} paddingTop={1}>
          <Text color={cleanRowSelected ? "cyan" : undefined} dimColor={!cleanRowSelected}>
            {cleanRowSelected ? " > " : "   "}
            {cleanableCount} worktrees to clean (Press Enter to clean up)
          </Text>
        </Box>
      )}

      {/* Section margin */}
      <Text>{" "}</Text>
      <Text>{" "}</Text>

      <RepoList
        repos={repos}
        dimmed={!active}
        selectedIndex={isRepoSelected ? selectedRepoIndex : undefined}
      />

      {/* Section margin */}
      <Text>{" "}</Text>
      <Text>{" "}</Text>

      <WorkflowList
        workflows={workflows}
        dimmed={!active}
      />
    </Box>
  );
}
