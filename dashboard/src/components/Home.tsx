import React, { useState, useCallback, useEffect } from "react";
import { Box, useInput } from "ink";
import fs from "node:fs";
import { execSync, spawn } from "node:child_process";
import { SessionList } from "./SessionList.js";
import { ProtectedList } from "./ProtectedList.js";
import { RepoList } from "./RepoList.js";
import { LogList } from "./LogList.js";
import { TabBar, type TabId } from "./TabBar.js";
import { BOTTOM_PANEL_HEIGHT } from "./BottomPanel.js";
import { HEADER_HEIGHT_FULL } from "./Header.js";
import { computeScrollOffset } from "../utils/scroll.js";
import { useKeyboard } from "../hooks/useKeyboard.js";
import { useFooter } from "../contexts/FooterContext.js";
import { switchToTmuxSession, createOrAttachRepoSession } from "../utils/tmux.js";
import type { SessionData, ProtectedWorktreeData, RepoInfo, LogFileInfo, WorkflowInfo } from "../utils/types.js";

const TAB_BAR_HEIGHT = 2;
const FOOTER_HEIGHT = 2;

interface HomeProps {
  sessions: SessionData[];
  protectedWorktrees: ProtectedWorktreeData[];
  repos: RepoInfo[];
  logs: LogFileInfo[];
  workflows: WorkflowInfo[];
  cleanableCount: number;
  active: boolean;
  columns: number;
  rows: number;
  refresh: () => void;
  refreshProtected: () => void;
  refreshRepos: () => void;
  refreshLogs: () => void;
  onNavigate: (target: "create" | "palette" | "add-repo") => void;
  onDetailSession: (sessionName: string) => void;
  onDetailRepo: (repoName: string) => void;
  onSelectedSessionChange: (session: SessionData | undefined) => void;
  pendingAction: string | null;
  onActionHandled: () => void;
  focusSessionName: string | null;
  onFocusSessionHandled: () => void;
}

export function Home({
  sessions,
  protectedWorktrees,
  repos,
  logs,
  workflows,
  cleanableCount,
  active,
  columns,
  rows,
  refresh,
  refreshProtected,
  refreshRepos,
  refreshLogs,
  onNavigate,
  onDetailSession,
  onDetailRepo,
  onSelectedSessionChange,
  pendingAction,
  onActionHandled,
  focusSessionName,
  onFocusSessionHandled,
}: HomeProps) {
  const { showMessage, showError, setOverride, clearOverride } = useFooter();

  // --- Dynamic tab order (hide empty optional tabs) ---
  const TAB_ORDER: TabId[] = React.useMemo(() => {
    const tabs: TabId[] = ["sessions", "repos", "logs"];
    if (protectedWorktrees.length > 0) tabs.push("protected");
    return tabs;
  }, [protectedWorktrees.length]);

  // --- Tab state ---
  const [activeTab, setActiveTab] = useState<TabId>("sessions");

  // If active tab is no longer in TAB_ORDER (e.g. protected became 0), reset to sessions
  useEffect(() => {
    if (!TAB_ORDER.includes(activeTab)) {
      setActiveTab("sessions");
    }
  }, [TAB_ORDER, activeTab]);

  // Per-tab selection indices
  const [sessionSelectedIndex, setSessionSelectedIndex] = useState(0);
  const [repoSelectedIndex, setRepoSelectedIndex] = useState(0);
  const [protectedSelectedIndex, setProtectedSelectedIndex] = useState(0);
  const [logSelectedIndex, setLogSelectedIndex] = useState(0);

  // Confirmation / async states
  const [confirmingKill, setConfirmingKill] = useState(false);
  const [confirmingClean, setConfirmingClean] = useState(false);
  const [confirmingDeleteSession, setConfirmingDeleteSession] = useState(false);
  const [confirmingUnprotect, setConfirmingUnprotect] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  // Rename state
  const [renamingRepo, setRenamingRepo] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // --- Tab switching ---
  const goNextTab = useCallback(() => {
    setActiveTab((cur) => {
      const idx = TAB_ORDER.indexOf(cur);
      return TAB_ORDER[(idx + 1) % TAB_ORDER.length]!;
    });
  }, [TAB_ORDER]);

  const goPrevTab = useCallback(() => {
    setActiveTab((cur) => {
      const idx = TAB_ORDER.indexOf(cur);
      return TAB_ORDER[(idx - 1 + TAB_ORDER.length) % TAB_ORDER.length]!;
    });
  }, [TAB_ORDER]);

  // --- maxVisible ---
  const maxVisible = rows - HEADER_HEIGHT_FULL - TAB_BAR_HEIGHT - BOTTOM_PANEL_HEIGHT - FOOTER_HEIGHT;

  // --- Per-tab max indices ---
  const sessionMaxIndex = Math.max(0, sessions.length - 1);
  const repoMaxIndex = Math.max(0, repos.length - 1);
  const logMaxIndex = Math.max(0, logs.length - 1);
  const protectedMaxIndex = Math.max(0, protectedWorktrees.length - 1);

  // Clamp indices
  if (sessionSelectedIndex > sessionMaxIndex && sessionMaxIndex >= 0) {
    setSessionSelectedIndex(sessionMaxIndex);
  }
  if (repoSelectedIndex > repoMaxIndex && repoMaxIndex >= 0) {
    setRepoSelectedIndex(repoMaxIndex);
  }
  if (logSelectedIndex > logMaxIndex && logMaxIndex >= 0) {
    setLogSelectedIndex(logMaxIndex);
  }
  if (protectedSelectedIndex > protectedMaxIndex && protectedMaxIndex >= 0) {
    setProtectedSelectedIndex(protectedMaxIndex);
  }

  // --- Focus newly created session ---
  useEffect(() => {
    if (!focusSessionName) return;
    const idx = sessions.findIndex((s) => s.name === focusSessionName);
    if (idx >= 0) {
      setActiveTab("sessions");
      setSessionSelectedIndex(idx);
      onFocusSessionHandled();
    }
  }, [focusSessionName, sessions, onFocusSessionHandled]);

  // --- Derived state ---
  const selectedSession: SessionData | undefined =
    activeTab === "sessions" && sessionSelectedIndex < sessions.length
      ? sessions[sessionSelectedIndex]
      : undefined;

  const selectedProtected: ProtectedWorktreeData | undefined =
    activeTab === "protected" && protectedSelectedIndex < protectedWorktrees.length
      ? protectedWorktrees[protectedSelectedIndex]
      : undefined;

  // --- Scroll offsets ---
  const sessionScrollOffset = computeScrollOffset(sessionSelectedIndex, sessions.length, maxVisible - 1);
  const repoScrollOffset = computeScrollOffset(repoSelectedIndex, repos.length, maxVisible);
  const logScrollOffset = computeScrollOffset(logSelectedIndex, logs.length, maxVisible - 1);
  const protectedScrollOffset = computeScrollOffset(protectedSelectedIndex, protectedWorktrees.length, maxVisible - 1);

  // --- Report selected session to parent ---
  useEffect(() => {
    onSelectedSessionChange(selectedSession);
  }, [selectedSession, onSelectedSessionChange]);

  // --- Footer overrides ---
  useEffect(() => {
    if (cleaning) {
      setOverride({ type: "cleaning" });
    } else if (confirmingUnprotect && selectedProtected) {
      setOverride({ type: "confirmUnprotect", name: `${selectedProtected.repo}/${selectedProtected.branch}` });
    } else if (confirmingClean) {
      setOverride({ type: "confirmClean", count: cleanableCount });
    } else if (confirmingKill && selectedSession) {
      setOverride({ type: "confirmKill", name: selectedSession.name });
    } else if (renamingRepo) {
      setOverride({ type: "renaming", name: renamingRepo });
    } else {
      clearOverride();
    }
  }, [cleaning, confirmingUnprotect, confirmingClean, confirmingKill, renamingRepo, cleanableCount, selectedSession, selectedProtected, setOverride, clearOverride]);

  useEffect(() => {
    return () => { clearOverride(); };
  }, [clearOverride]);

  // --- Actions ---
  const openLogInNvim = useCallback(() => {
    const log = logs[logSelectedIndex];
    if (!log) return;
    try {
      execSync(`nvim '${log.path}'`, { stdio: "inherit" });
      if (process.stdin.isTTY && process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
      }
      process.stdout.write("\x1b[2J\x1b[H");
      refreshLogs();
    } catch {
      showMessage(`Failed to open ${log.name}`);
    }
  }, [logs, logSelectedIndex, refreshLogs, showMessage]);

  const switchToSession = useCallback(() => {
    if (!selectedSession) return;

    // Recover disconnected session before attaching
    if (!selectedSession.tmuxAlive) {
      try {
        execSync(`fed session recover '${selectedSession.name}' --no-attach`, { stdio: "ignore" });
        showMessage(`Recovered: ${selectedSession.name}`);
        refresh();
      } catch {
        showMessage(`Failed to recover ${selectedSession.name}`);
        return;
      }
    }

    const target = selectedSession.meta.tmux_session;
    const ok = switchToTmuxSession(target);
    if (ok) {
      showMessage(`Detached from ${selectedSession.name}`);
    } else {
      showMessage(`Failed to switch to ${selectedSession.name}`);
    }
  }, [selectedSession, showMessage, refresh]);

  const killSession = useCallback(() => {
    if (!selectedSession) return;
    try {
      execSync(`fed session stop '${selectedSession.name}'`, { stdio: "ignore" });
      showMessage(`Stopped: ${selectedSession.name}`);
      refresh();
    } catch {
      showMessage(`Failed to stop ${selectedSession.name}`);
    }
  }, [selectedSession, showMessage, refresh]);

  const archiveSession = useCallback(() => {
    if (!selectedSession) return;
    try {
      execSync(`fed session archive '${selectedSession.name}'`, { stdio: "ignore" });
      showMessage(`Archived: ${selectedSession.name}`);
      refresh();
    } catch {
      showMessage(`Failed to archive ${selectedSession.name}`);
    }
  }, [selectedSession, showMessage, refresh]);

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

  const handleRenameSubmit = useCallback((newName: string) => {
    if (!renamingRepo || !newName.trim() || newName.trim() === renamingRepo) {
      setRenamingRepo(null);
      setRenameValue("");
      return;
    }
    try {
      execSync(`fed repo rename '${renamingRepo}' '${newName.trim()}'`, { stdio: "pipe" });
      showMessage(`Renamed: ${renamingRepo} → ${newName.trim()}`);
      refreshRepos();
    } catch (e: unknown) {
      const err = e as { stderr?: Buffer };
      const msg = err.stderr?.toString().trim() || `Failed to rename ${renamingRepo}`;
      showError(msg);
    }
    setRenamingRepo(null);
    setRenameValue("");
  }, [renamingRepo, showMessage, showError, refreshRepos]);

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
    }
    onActionHandled();
  }, [pendingAction, onActionHandled, switchToSession, killSession, runClean, archiveSession]);

  // --- Keyboard handlers ---
  useKeyboard(
    {
      onTabNext: goNextTab,
      onTabPrev: goPrevTab,
      onUp: () => {
        if (activeTab === "sessions") {
          setSessionSelectedIndex((i) => (i <= 0 ? sessionMaxIndex : i - 1));
        } else if (activeTab === "repos") {
          setRepoSelectedIndex((i) => (i <= 0 ? repoMaxIndex : i - 1));
        } else if (activeTab === "logs") {
          setLogSelectedIndex((i) => (i <= 0 ? logMaxIndex : i - 1));
        } else if (activeTab === "protected") {
          setProtectedSelectedIndex((i) => (i <= 0 ? protectedMaxIndex : i - 1));
        }
      },
      onDown: () => {
        if (activeTab === "sessions") {
          setSessionSelectedIndex((i) => (i >= sessionMaxIndex ? 0 : i + 1));
        } else if (activeTab === "repos") {
          setRepoSelectedIndex((i) => (i >= repoMaxIndex ? 0 : i + 1));
        } else if (activeTab === "logs") {
          setLogSelectedIndex((i) => (i >= logMaxIndex ? 0 : i + 1));
        } else if (activeTab === "protected") {
          setProtectedSelectedIndex((i) => (i >= protectedMaxIndex ? 0 : i + 1));
        }
      },
      onEnter: () => {
        if (activeTab === "sessions" && selectedSession) {
          switchToSession();
        } else if (activeTab === "repos") {
          openRepoTmuxSession(repoSelectedIndex);
        } else if (activeTab === "logs") {
          openLogInNvim();
        }
      },
      onStop: () => {
        if (activeTab === "sessions" && selectedSession) setConfirmingKill(true);
      },
      onClean: () => {
        if (cleanableCount > 0) setConfirmingClean(true);
      },
      onProtect: () => {
        if (activeTab === "protected" && selectedProtected) {
          setConfirmingUnprotect(true);
        }
      },
      onAdd: () => {
        if (activeTab === "sessions") {
          onNavigate("create");
        } else if (activeTab === "repos") {
          onNavigate("add-repo");
        }
      },
      onPalette: () => {
        onNavigate("palette");
      },
      onSpace: () => {
        if (activeTab === "sessions" && selectedSession) {
          onDetailSession(selectedSession.name);
        } else if (activeTab === "repos" && repos[repoSelectedIndex]) {
          onDetailRepo(repos[repoSelectedIndex]!.name);
        }
      },
      onRename: () => {
        if (activeTab === "repos" && repos[repoSelectedIndex]) {
          const repo = repos[repoSelectedIndex]!;
          setRenamingRepo(repo.name);
          setRenameValue(repo.name);
        }
      },
    },
    active && !confirmingKill && !confirmingClean && !confirmingUnprotect && !renamingRepo
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

  // Unprotect confirmation handler
  useInput(
    (_input) => {
      if ((_input === "y" || _input === "Y") && selectedProtected) {
        setConfirmingUnprotect(false);
        try {
          execSync(`fed worktree unprotect '${selectedProtected.repo}' '${selectedProtected.branch}'`, { stdio: "ignore" });
          showMessage(`Unprotected: ${selectedProtected.repo}/${selectedProtected.branch}`);
          refreshProtected();
          refresh();
        } catch {
          showMessage(`Failed to unprotect ${selectedProtected.repo}/${selectedProtected.branch}`);
        }
      } else {
        setConfirmingUnprotect(false);
      }
    },
    { isActive: active && confirmingUnprotect }
  );

  // Rename cancel handler
  useInput(
    (_input, key) => {
      if (key.escape) {
        setRenamingRepo(null);
        setRenameValue("");
      }
    },
    { isActive: active && !!renamingRepo }
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      <TabBar
        activeTab={activeTab}
        tabs={[
          { id: "sessions", label: "Sessions", count: sessions.length },
          { id: "repos", label: "Repositories", count: repos.length },
          { id: "logs", label: "Logs", count: logs.length },
          ...(protectedWorktrees.length > 0
            ? [{ id: "protected" as TabId, label: "Protected", count: protectedWorktrees.length }]
            : []),
        ]}
      />
      <Box height={1} />

      {activeTab === "sessions" && (
        <SessionList
          sessions={sessions}
          dimmed={!active}
          selectedIndex={!active ? undefined : sessionSelectedIndex}
          maxVisible={maxVisible}
          scrollOffset={sessionScrollOffset}
        />
      )}

      {activeTab === "repos" && (
        <RepoList
          repos={repos}
          dimmed={!active}
          selectedIndex={!active ? undefined : repoSelectedIndex}
          maxVisible={maxVisible}
          scrollOffset={repoScrollOffset}
          renamingRepo={renamingRepo}
          renameValue={renameValue}
          onRenameChange={setRenameValue}
          onRenameSubmit={handleRenameSubmit}
        />
      )}

      {activeTab === "logs" && (
        <LogList
          logs={logs}
          dimmed={!active}
          selectedIndex={!active ? undefined : logSelectedIndex}
          maxVisible={maxVisible}
          scrollOffset={logScrollOffset}
        />
      )}

      {activeTab === "protected" && (
        <ProtectedList
          worktrees={protectedWorktrees}
          dimmed={!active}
          selectedIndex={!active ? undefined : protectedSelectedIndex}
          maxVisible={maxVisible}
          scrollOffset={protectedScrollOffset}
        />
      )}
    </Box>
  );
}
