import React, { useState, useCallback, useEffect } from "react";
import { Box, useInput } from "ink";
import fs from "node:fs";
import { execSync, spawn } from "node:child_process";
import { SessionList } from "./SessionList.js";
import { RestorableList } from "./RestorableList.js";
import { RepoList } from "./RepoList.js";
import { WorkflowList } from "./WorkflowList.js";
import { TabBar, type TabId } from "./TabBar.js";
import { BOTTOM_PANEL_HEIGHT } from "./BottomPanel.js";
import { HEADER_HEIGHT_FULL } from "./Header.js";
import { computeScrollOffset } from "../utils/scroll.js";
import { useKeyboard } from "../hooks/useKeyboard.js";
import { useFooter } from "../contexts/FooterContext.js";
import { switchToTmuxSession, createOrAttachRepoSession } from "../utils/tmux.js";
import type { SessionData, RestorableSessionData, RepoInfo, WorkflowInfo } from "../utils/types.js";

const TAB_ORDER: TabId[] = ["sessions", "repos", "workflows", "restorable"];
const TAB_BAR_HEIGHT = 2;
const FOOTER_HEIGHT = 2;

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

  // --- Tab state ---
  const [activeTab, setActiveTab] = useState<TabId>("sessions");

  // Per-tab selection indices
  const [sessionSelectedIndex, setSessionSelectedIndex] = useState(0);
  const [repoSelectedIndex, setRepoSelectedIndex] = useState(0);
  const [restorableSelectedIndex, setRestorableSelectedIndex] = useState(0);

  // Confirmation / async states
  const [confirmingKill, setConfirmingKill] = useState(false);
  const [confirmingClean, setConfirmingClean] = useState(false);
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const [confirmingDeleteSession, setConfirmingDeleteSession] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // --- Tab switching ---
  const goNextTab = useCallback(() => {
    setActiveTab((cur) => {
      const idx = TAB_ORDER.indexOf(cur);
      return TAB_ORDER[(idx + 1) % TAB_ORDER.length]!;
    });
  }, []);

  const goPrevTab = useCallback(() => {
    setActiveTab((cur) => {
      const idx = TAB_ORDER.indexOf(cur);
      return TAB_ORDER[(idx - 1 + TAB_ORDER.length) % TAB_ORDER.length]!;
    });
  }, []);

  // --- maxVisible ---
  const maxVisible = rows - HEADER_HEIGHT_FULL - TAB_BAR_HEIGHT - BOTTOM_PANEL_HEIGHT - FOOTER_HEIGHT;

  // --- Per-tab max indices ---
  const sessionMaxIndex = Math.max(0, sessions.length - 1);
  const repoMaxIndex = Math.max(0, repos.length - 1);
  const restorableMaxIndex = Math.max(0, restorableSessions.length - 1);

  // Clamp indices
  if (sessionSelectedIndex > sessionMaxIndex && sessionMaxIndex >= 0) {
    setSessionSelectedIndex(sessionMaxIndex);
  }
  if (repoSelectedIndex > repoMaxIndex && repoMaxIndex >= 0) {
    setRepoSelectedIndex(repoMaxIndex);
  }
  if (restorableSelectedIndex > restorableMaxIndex && restorableMaxIndex >= 0) {
    setRestorableSelectedIndex(restorableMaxIndex);
  }

  // --- Derived state ---
  const selectedSession: SessionData | undefined =
    activeTab === "sessions" && sessionSelectedIndex < sessions.length
      ? sessions[sessionSelectedIndex]
      : undefined;

  const selectedRestorable: RestorableSessionData | undefined =
    activeTab === "restorable" && restorableSelectedIndex < restorableSessions.length
      ? restorableSessions[restorableSelectedIndex]
      : undefined;

  // --- Scroll offsets ---
  const sessionScrollOffset = computeScrollOffset(sessionSelectedIndex, sessions.length, maxVisible - 1);
  const repoScrollOffset = computeScrollOffset(repoSelectedIndex, repos.length, maxVisible);
  const restorableScrollOffset = computeScrollOffset(restorableSelectedIndex, restorableSessions.length, maxVisible - 1);

  // --- Report selected session to parent ---
  useEffect(() => {
    onSelectedSessionChange(selectedSession);
  }, [selectedSession, onSelectedSessionChange]);

  // --- Footer overrides ---
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

  useEffect(() => {
    return () => { clearOverride(); };
  }, [clearOverride]);

  // --- Actions ---
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

  const restoreSession = useCallback(() => {
    if (!selectedRestorable) return;
    const name = selectedRestorable.name;
    setRestoring(true);
    const proc = spawn("fed", ["session", "restore", name, "--no-attach"], {
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
        } else if (activeTab === "restorable") {
          setRestorableSelectedIndex((i) => (i <= 0 ? restorableMaxIndex : i - 1));
        }
      },
      onDown: () => {
        if (activeTab === "sessions") {
          setSessionSelectedIndex((i) => (i >= sessionMaxIndex ? 0 : i + 1));
        } else if (activeTab === "repos") {
          setRepoSelectedIndex((i) => (i >= repoMaxIndex ? 0 : i + 1));
        } else if (activeTab === "restorable") {
          setRestorableSelectedIndex((i) => (i >= restorableMaxIndex ? 0 : i + 1));
        }
      },
      onEnter: () => {
        if (activeTab === "sessions" && selectedSession) {
          switchToSession();
        } else if (activeTab === "repos") {
          openRepoTmuxSession(repoSelectedIndex);
        } else if (activeTab === "restorable" && selectedRestorable) {
          setConfirmingRestore(true);
        }
      },
      onStop: () => {
        if (activeTab === "sessions" && selectedSession) setConfirmingKill(true);
      },
      onClean: () => {
        if (cleanableCount > 0) setConfirmingClean(true);
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
      <TabBar
        activeTab={activeTab}
        tabs={[
          { id: "sessions", label: "Sessions", count: sessions.length },
          { id: "repos", label: "Repositories", count: repos.length },
          { id: "workflows", label: "Workflows", count: workflows.length },
          { id: "restorable", label: "Restorable", count: restorableSessions.length },
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
        />
      )}

      {activeTab === "workflows" && (
        <WorkflowList
          workflows={workflows}
          dimmed={!active}
          maxVisible={maxVisible}
          scrollOffset={0}
        />
      )}

      {activeTab === "restorable" && (
        <RestorableList
          sessions={restorableSessions}
          dimmed={!active}
          selectedIndex={!active ? undefined : restorableSelectedIndex}
          maxVisible={maxVisible}
          scrollOffset={restorableScrollOffset}
        />
      )}
    </Box>
  );
}
