import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import fs from "node:fs";
import { execSync, spawn } from "node:child_process";
import { SessionList } from "./SessionList.js";
import { RestorableSessionList } from "./RestorableSessionList.js";
import { RepoList } from "./RepoList.js";
import { WorkflowList } from "./WorkflowList.js";
import { useKeyboard } from "../hooks/useKeyboard.js";
import { useFooter } from "../contexts/FooterContext.js";
import { switchToTmuxSession, createOrAttachRepoSession } from "../utils/tmux.js";
import type { SessionData, RestorableSessionData, RepoInfo, WorkflowInfo } from "../utils/types.js";

interface HomeProps {
  sessions: SessionData[];
  restorableSessions: RestorableSessionData[];
  repos: RepoInfo[];
  workflows: WorkflowInfo[];
  cleanableCount: number;
  active: boolean;
  columns: number;
  rows: number;
  refresh: () => void;
  refreshRestorable: () => void;
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
  restorableSessions,
  repos,
  workflows,
  cleanableCount,
  active,
  columns,
  rows,
  refresh,
  refreshRestorable,
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
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Navigation: sessions -> restorable -> clean row -> repos
  const hasCleanRow = cleanableCount > 0;
  const cleanOffset = hasCleanRow ? 1 : 0;
  const restorableStartIndex = sessions.length;
  const cleanStartIndex = restorableStartIndex + restorableSessions.length;
  const repoStartIndex = cleanStartIndex + cleanOffset;
  const totalItems = repoStartIndex + repos.length;
  const maxIndex = Math.max(0, totalItems - 1);
  const cleanRowSelected = hasCleanRow && selectedIndex === cleanStartIndex;
  const isRestorableSelected = selectedIndex >= restorableStartIndex && selectedIndex < cleanStartIndex;
  const selectedRestorableIndex = isRestorableSelected ? selectedIndex - restorableStartIndex : -1;
  const selectedRestorable: RestorableSessionData | undefined = isRestorableSelected
    ? restorableSessions[selectedRestorableIndex]
    : undefined;
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
    if (restoring) {
      setOverride({ type: "restoring" });
    } else if (cleaning) {
      setOverride({ type: "cleaning" });
    } else if (confirmingRestore && selectedRestorable) {
      setOverride({ type: "confirmRestore", name: selectedRestorable.name });
    } else if (confirmingClean) {
      setOverride({ type: "confirmClean", count: cleanableCount });
    } else if (confirmingKill && selectedSession) {
      setOverride({ type: "confirmKill", name: selectedSession.name });
    } else {
      clearOverride();
    }
  }, [restoring, cleaning, confirmingRestore, confirmingClean, confirmingKill, cleanableCount, selectedSession, selectedRestorable, setOverride, clearOverride]);

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

  // Restore session (async via spawn)
  const restoreSession = useCallback(() => {
    if (!selectedRestorable) return;
    const name = selectedRestorable.name;
    setRestoring(true);

    const proc = spawn("fed", ["restore", "session", name, "--no-attach"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    proc.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      setRestoring(false);
      clearOverride();
      if (code === 0) {
        showMessage(`Restored: ${name}`);
        refresh();
        refreshRestorable();
      } else {
        showError(stderr.trim() || `Failed to restore ${name}`);
      }
    });

    proc.on("error", () => {
      setRestoring(false);
      clearOverride();
      showError(`Failed to restore ${name}`);
    });
  }, [selectedRestorable, refresh, refreshRestorable, showMessage, showError, clearOverride]);

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

  // Open (or create) a dedicated tmux session for the repo
  const openRepoTmuxSession = useCallback((repoIndex: number) => {
    const repo = repos[repoIndex];
    if (!repo) return;
    if (!fs.existsSync(repo.repoRoot)) {
      showError(`Directory not found: ${repo.repoRoot}`);
      return;
    }
    const ok = createOrAttachRepoSession(repo.name, repo.repoRoot);
    if (ok) {
      refreshRepos();
    } else {
      showError(`Failed to open tmux session for ${repo.name}`);
    }
  }, [repos, showError, refreshRepos]);

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
        setSelectedIndex((i) => (i <= 0 ? maxIndex : i - 1));
      },
      onDown: () => {
        setSelectedIndex((i) => (i >= maxIndex ? 0 : i + 1));
      },
      onEnter: () => {
        if (cleanRowSelected) {
          setConfirmingClean(true);
        } else if (isRestorableSelected && selectedRestorable) {
          setConfirmingRestore(true);
        } else if (isRepoSelected) {
          openRepoTmuxSession(selectedRepoIndex);
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
    active && !confirmingKill && !confirmingClean && !confirmingRestore
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

  // Restore confirmation handler
  useInput(
    (_input) => {
      if (_input === "y" || _input === "Y") {
        restoreSession();
        setConfirmingRestore(false);
      } else {
        setConfirmingRestore(false);
      }
    },
    { isActive: active && confirmingRestore }
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
      <RestorableSessionList
        sessions={restorableSessions}
        selectedIndex={isRestorableSelected ? selectedRestorableIndex : undefined}
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
