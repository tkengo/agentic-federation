import React, { useState, useCallback, useRef, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { SessionList } from "./SessionList.js";
import { DetailPanel, useScripts, usePanes, LOG_MAX_VISIBLE } from "./DetailPanel.js";
import type { DetailMode } from "./DetailPanel.js";
import { PreviewPanel } from "./PreviewPanel.js";
import { RepoList } from "./RepoList.js";
import { WorkflowList } from "./WorkflowList.js";
import { useArtifacts } from "./ArtifactList.js";
import { usePreviewContent } from "../hooks/usePreviewContent.js";
import { useKeyboard } from "../hooks/useKeyboard.js";
import { REPOS_DIR } from "../utils/types.js";
import type { SessionData, RepoInfo, FooterOverride, WorkflowInfo } from "../utils/types.js";

// Minimum terminal width to show the preview side panel
const PREVIEW_MIN_COLUMNS = 130;

interface HomeProps {
  sessions: SessionData[];
  repos: RepoInfo[];
  workflows: WorkflowInfo[];
  cleanableCount: number;
  active: boolean;
  columns: number;
  rows: number;
  showMessage: (msg: string) => void;
  refresh: () => void;
  refreshRepos: () => void;
  onNavigate: (target: "create" | "palette" | "add-repo") => void;
  onSelectedSessionChange: (session: SessionData | undefined) => void;
  onFooterOverrideChange: (override: FooterOverride) => void;
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
  showMessage,
  refresh,
  refreshRepos,
  onNavigate,
  onSelectedSessionChange,
  onFooterOverrideChange,
  pendingAction,
  onActionHandled,
}: HomeProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [detailIndex, setDetailIndex] = useState(0);
  const [detailMode, setDetailMode] = useState<DetailMode>("browse");
  const [confirmingScript, setConfirmingScript] = useState(false);
  const [confirmingKill, setConfirmingKill] = useState(false);
  const [confirmingClean, setConfirmingClean] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  // Pane sending state
  const [sendingValue, setSendingValue] = useState("");
  const [sendingPaneIndex, setSendingPaneIndex] = useState(-1);

  // Script execution state
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logScroll, setLogScroll] = useState(0);
  const [scriptExitCode, setScriptExitCode] = useState<number | null>(null);
  const [scriptKilled, setScriptKilled] = useState(false);
  const [runningScriptName, setRunningScriptName] = useState<string | null>(null);
  const scriptProcessRef = useRef<ChildProcess | null>(null);
  const logBufferRef = useRef("");
  const logFileRef = useRef<fs.WriteStream | null>(null);
  const logUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollRef = useRef(true);

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
      onFooterOverrideChange({ type: "cleaning" });
    } else if (confirmingClean) {
      onFooterOverrideChange({ type: "confirmClean", count: cleanableCount });
    } else if (confirmingKill && selectedSession) {
      onFooterOverrideChange({ type: "confirmKill", name: selectedSession.name });
    } else if (confirmingScript) {
      const scriptIdx = detailIndex - expandedArtifacts.length;
      const scriptDef = expandedScripts[scriptIdx];
      if (scriptDef) {
        onFooterOverrideChange({ type: "confirmScript", name: scriptDef.name });
      } else {
        onFooterOverrideChange(null);
      }
    } else {
      onFooterOverrideChange(null);
    }
  }, [cleaning, confirmingClean, confirmingKill, confirmingScript, cleanableCount, selectedSession, detailIndex]);

  // Preview panel state
  const [previewScroll, setPreviewScroll] = useState(0);

  // Data for expanded session
  const expandedSession = expandedIndex !== null ? sessions[expandedIndex] : undefined;
  const expandedArtifacts = useArtifacts(expandedSession?.sessionDir ?? "");
  const expandedScripts = useScripts(expandedSession?.sessionDir ?? "");
  const expandedPanes = usePanes(expandedSession?.sessionDir ?? "");
  const totalDetailItems = expandedArtifacts.length + expandedScripts.length + expandedPanes.length;

  // Preview content for selected detail item
  const previewData = usePreviewContent(
    expandedSession?.sessionDir ?? "",
    expandedArtifacts,
    expandedScripts,
    expandedPanes,
    detailIndex,
  );

  // Determine if preview side panel should be shown
  const showPreview = expandedIndex !== null && columns >= PREVIEW_MIN_COLUMNS;

  // Reset preview scroll when detail selection changes
  const prevDetailIndexRef = useRef(detailIndex);
  useEffect(() => {
    if (prevDetailIndexRef.current !== detailIndex) {
      setPreviewScroll(0);
      prevDetailIndexRef.current = detailIndex;
    }
  }, [detailIndex]);

  // Collapse when expanded session disappears
  if (expandedIndex !== null && !expandedSession) {
    setExpandedIndex(null);
  }

  // Cleanup script state when expanding/collapsing
  const prevExpandedRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevExpandedRef.current !== null && expandedIndex === null) {
      // Collapsed: kill running script and cleanup
      if (scriptProcessRef.current) {
        scriptProcessRef.current.kill("SIGTERM");
        scriptProcessRef.current = null;
      }
      if (logFileRef.current) {
        logFileRef.current.end();
        logFileRef.current = null;
      }
      if (logUpdateTimerRef.current) {
        clearTimeout(logUpdateTimerRef.current);
        logUpdateTimerRef.current = null;
      }
      logBufferRef.current = "";
    }
    if (expandedIndex !== null && expandedIndex !== prevExpandedRef.current) {
      // Opened or switched session: reset detail state
      setDetailIndex(0);
      setDetailMode("browse");
      setConfirmingScript(false);
      setLogLines([]);
      setLogScroll(0);
      setRunningScriptName(null);
      setScriptExitCode(null);
      setScriptKilled(false);
      autoScrollRef.current = true;
      setSendingValue("");
      setSendingPaneIndex(-1);
    }
    prevExpandedRef.current = expandedIndex;
  }, [expandedIndex]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scriptProcessRef.current) {
        scriptProcessRef.current.kill("SIGTERM");
      }
      if (logFileRef.current) {
        logFileRef.current.end();
      }
      if (logUpdateTimerRef.current) {
        clearTimeout(logUpdateTimerRef.current);
      }
    };
  }, []);

  // Switch to tmux session
  const switchToSession = useCallback(() => {
    if (!selectedSession) return;
    const target = selectedSession.meta.tmux_session;
    const insideTmux = !!process.env.TMUX;
    try {
      if (insideTmux) {
        execSync(`tmux switch-client -t '${target}'`, { stdio: "ignore" });
      } else {
        execSync(`tmux attach-session -t '${target}'`, { stdio: "inherit" });
        if (process.stdin.isTTY && process.stdin.setRawMode) {
          process.stdin.setRawMode(true);
        }
        process.stdout.write("\x1b[2J\x1b[H");
      }
    } catch {
      showMessage(`Failed to switch to ${selectedSession.name}`);
    }
    showMessage(`Detached from ${selectedSession.name}`);
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

  // Run fed clean
  const runClean = useCallback((force?: boolean) => {
    setCleaning(true);
    setTimeout(() => {
      try {
        const cmd = force ? "fed clean --force" : "fed clean";
        const output = execSync(cmd, { encoding: "utf-8" });
        const doneLine = output.match(/^Done\. (.+)$/m);
        showMessage(doneLine ? doneLine[1] : "Cleaned worktrees");
        refresh();
      } catch (err: unknown) {
        const output = (err as { stdout?: string }).stdout ?? "";
        const doneLine = output.match(/^Done\. (.+)$/m);
        showMessage(doneLine ? doneLine[1] : "Failed to clean worktrees");
        refresh();
      }
      setCleaning(false);
    }, 50);
  }, [showMessage, refresh]);

  // Open repo config in nvim
  const openRepoConfig = useCallback((repoIndex: number) => {
    const repo = repos[repoIndex];
    if (!repo) return;
    const jsonPath = path.join(REPOS_DIR, `${repo.name}.json`);
    try {
      execSync(`nvim '${jsonPath}'`, { stdio: "inherit" });
      if (process.stdin.isTTY && process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
      }
      process.stdout.write("\x1b[2J\x1b[H");
      refreshRepos();
    } catch {
      showMessage(`Failed to open ${repo.name}.json`);
    }
  }, [repos, refreshRepos, showMessage]);

  // Run a script from the expanded session
  const runScript = useCallback(() => {
    if (!expandedSession) return;
    const scriptIdx = detailIndex - expandedArtifacts.length;
    const scriptDef = expandedScripts[scriptIdx];
    if (!scriptDef) return;

    const sessionDir = expandedSession.sessionDir;
    const sessionName = expandedSession.meta.tmux_session;

    // Create log file
    const logsDir = path.join(sessionDir, "script-logs");
    fs.mkdirSync(logsDir, { recursive: true });
    const now = new Date();
    const ts = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("");
    const id = crypto.randomBytes(3).toString("hex");
    const logFileName = `${ts}_${id}_${scriptDef.name}.log`;
    const logFilePath = path.join(logsDir, logFileName);
    const logStream = fs.createWriteStream(logFilePath);
    logFileRef.current = logStream;

    // Reset state
    logBufferRef.current = "";
    autoScrollRef.current = true;
    setLogLines([]);
    setLogScroll(0);
    setScriptExitCode(null);
    setScriptKilled(false);
    setRunningScriptName(scriptDef.name);
    setDetailMode("running");

    const proc = spawn("fed", ["repo-script", "run", scriptDef.name, "--session", sessionName], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    scriptProcessRef.current = proc;

    const handleData = (data: Buffer) => {
      const text = data.toString();
      logStream.write(text);
      logBufferRef.current += text;

      // Debounce UI updates (50ms)
      if (!logUpdateTimerRef.current) {
        logUpdateTimerRef.current = setTimeout(() => {
          logUpdateTimerRef.current = null;
          const lines = logBufferRef.current.split("\n");
          setLogLines(lines);
          if (autoScrollRef.current) {
            setLogScroll(Math.max(0, lines.length - LOG_MAX_VISIBLE));
          }
        }, 50);
      }
    };

    proc.stdout?.on("data", handleData);
    proc.stderr?.on("data", handleData);

    proc.on("close", (code) => {
      if (logUpdateTimerRef.current) {
        clearTimeout(logUpdateTimerRef.current);
        logUpdateTimerRef.current = null;
      }
      const lines = logBufferRef.current.split("\n");
      setLogLines(lines);

      logStream.end();
      logFileRef.current = null;
      scriptProcessRef.current = null;
      setScriptExitCode(code ?? 1);
      setDetailMode("done");
    });

    proc.on("error", (err) => {
      logBufferRef.current += `\nError: ${err.message}\n`;
      const lines = logBufferRef.current.split("\n");
      setLogLines(lines);

      logStream.end();
      logFileRef.current = null;
      scriptProcessRef.current = null;
      setScriptExitCode(1);
      setDetailMode("done");
    });
  }, [expandedSession, detailIndex, expandedArtifacts.length, expandedScripts]);

  // Kill a running script
  const killScript = useCallback(() => {
    if (scriptProcessRef.current) {
      setScriptKilled(true);
      scriptProcessRef.current.kill("SIGTERM");
    }
  }, []);

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

  // Expanded browse mode
  useKeyboard(
    {
      onUp: () => {
        setDetailIndex((i) => Math.max(0, i - 1));
      },
      onDown: () => {
        setDetailIndex((i) => Math.min(Math.max(0, totalDetailItems - 1), i + 1));
      },
      onEnter: () => {
        if (!expandedSession) return;
        if (detailIndex < expandedArtifacts.length) {
          // Open artifact in nvim
          const artifactName = expandedArtifacts[detailIndex]?.name;
          if (!artifactName) return;
          const artifactPath = path.join(expandedSession.sessionDir, "artifacts", artifactName);
          try {
            execSync(`nvim '${artifactPath}'`, { stdio: "inherit" });
            if (process.stdin.isTTY && process.stdin.setRawMode) {
              process.stdin.setRawMode(true);
            }
            process.stdout.write("\x1b[2J\x1b[H");
          } catch {
            showMessage(`Failed to open ${artifactName}`);
          }
        } else if (detailIndex < expandedArtifacts.length + expandedScripts.length) {
          // Confirm script execution
          setConfirmingScript(true);
        } else {
          // Pane selected -> enter sending mode
          const paneIdx = detailIndex - expandedArtifacts.length - expandedScripts.length;
          setSendingPaneIndex(paneIdx);
          setSendingValue("");
          setDetailMode("sending");
        }
      },
      onSpace: () => {
        setExpandedIndex(null);
      },
      onBack: () => {
        setExpandedIndex(null);
      },
    },
    active && expandedIndex !== null && detailMode === "browse"
      && !confirmingScript && !confirmingKill && !confirmingClean && !cleaning
  );

  // Preview scroll in browse mode (Ctrl+U / Ctrl+D)
  useInput(
    (input, key) => {
      if (!showPreview) return;
      const previewContentHeight = Math.max(1, rows - 4);
      const maxScroll = Math.max(0, previewData.lines.length - previewContentHeight);
      if (key.ctrl && input === "u") {
        setPreviewScroll((s) => Math.max(0, s - previewContentHeight));
      } else if (key.ctrl && input === "d") {
        setPreviewScroll((s) => Math.min(maxScroll, s + previewContentHeight));
      }
    },
    { isActive: active && expandedIndex !== null && detailMode === "browse"
        && !confirmingScript && !confirmingKill && !confirmingClean && !cleaning }
  );

  // Script confirmation handler
  useInput(
    (_input) => {
      if (_input === "y" || _input === "Y") {
        setConfirmingScript(false);
        runScript();
      } else {
        setConfirmingScript(false);
      }
    },
    { isActive: active && expandedIndex !== null && confirmingScript }
  );

  // Script running mode keyboard handler
  useInput(
    (input, key) => {
      const isUp = key.upArrow || input === "k" || (key.ctrl && input === "p");
      const isDown = key.downArrow || input === "j" || (key.ctrl && input === "n");
      const isPageUp = key.ctrl && input === "u";
      const isPageDown = key.ctrl && input === "d";
      const maxScroll = Math.max(0, logLines.length - LOG_MAX_VISIBLE);

      if (key.escape) {
        killScript();
      } else if (isPageUp) {
        autoScrollRef.current = false;
        setLogScroll((s) => Math.max(0, s - LOG_MAX_VISIBLE));
      } else if (isPageDown) {
        setLogScroll((s) => {
          const next = Math.min(maxScroll, s + LOG_MAX_VISIBLE);
          if (next >= maxScroll) autoScrollRef.current = true;
          return next;
        });
      } else if (isUp) {
        autoScrollRef.current = false;
        setLogScroll((s) => Math.max(0, s - 1));
      } else if (isDown) {
        setLogScroll((s) => {
          const next = Math.min(maxScroll, s + 1);
          if (next >= maxScroll) autoScrollRef.current = true;
          return next;
        });
      }
    },
    { isActive: active && expandedIndex !== null && detailMode === "running" }
  );

  // Script done mode keyboard handler
  useInput(
    (input, key) => {
      const isUp = key.upArrow || input === "k" || (key.ctrl && input === "p");
      const isDown = key.downArrow || input === "j" || (key.ctrl && input === "n");
      const isPageUp = key.ctrl && input === "u";
      const isPageDown = key.ctrl && input === "d";
      const maxScroll = Math.max(0, logLines.length - LOG_MAX_VISIBLE);

      if (key.escape) {
        // Close detail panel and return to session list
        setExpandedIndex(null);
      } else if (isPageUp) {
        setLogScroll((s) => Math.max(0, s - LOG_MAX_VISIBLE));
      } else if (isPageDown) {
        setLogScroll((s) => Math.min(maxScroll, s + LOG_MAX_VISIBLE));
      } else if (isUp) {
        setLogScroll((s) => Math.max(0, s - 1));
      } else if (isDown) {
        setLogScroll((s) => Math.min(maxScroll, s + 1));
      }
    },
    { isActive: active && expandedIndex !== null && detailMode === "done" }
  );

  // Sending mode: Esc to cancel (Enter handled by EmacsTextInput's onSubmit)
  useInput(
    (_input, key) => {
      if (key.escape) {
        setSendingValue("");
        setSendingPaneIndex(-1);
        setDetailMode("browse");
      }
    },
    { isActive: active && expandedIndex !== null && detailMode === "sending" }
  );

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
          openRepoConfig(selectedRepoIndex);
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
          setExpandedIndex(selectedIndex);
          setDetailIndex(0);
        }
      },
    },
    active && expandedIndex === null && !confirmingKill && !confirmingClean && !cleaning
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
    { isActive: active && confirmingKill && !cleaning }
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
    { isActive: active && confirmingClean && !cleaning }
  );

  // Compute preview panel width
  // Left panel takes roughly: marginLeft(4) + boxWidth of DetailPanel
  // We give the remaining columns to the preview panel
  const previewWidth = showPreview ? Math.max(40, columns - 100) : 0;
  // Preview panel height: use available rows minus header/footer overhead
  // Header(~24 logo lines + 1 border) + footer(2) + session list overhead(~4) = ~30
  // Use rows directly since the panel will be constrained by the parent
  const previewHeight = Math.max(10, rows - 6);

  const renderDetailPanel = (session: SessionData, colWidths: { repoBranch: number; workflow: number; status: number }) => (
    <DetailPanel
      colWidths={colWidths}
      worktree={session.meta.worktree}
      description={session.description}
      hideDescription={showPreview}
      mode={detailMode}
      artifacts={expandedArtifacts}
      scripts={expandedScripts}
      panes={expandedPanes}
      selectedIndex={detailIndex}
      scriptName={runningScriptName ?? undefined}
      scriptExitCode={scriptExitCode}
      scriptKilled={scriptKilled}
      logLines={logLines}
      logScroll={logScroll}
      sendingPaneDisplayName={
        sendingPaneIndex >= 0 ? expandedPanes[sendingPaneIndex]?.displayName : undefined
      }
      sendingValue={sendingValue}
      onSendingChange={setSendingValue}
      onSendingSubmit={(text) => {
        if (!text.trim()) return;
        const pane = expandedPanes[sendingPaneIndex];
        if (!pane) return;
        const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
        try {
          // Send text literally first (synchronous).
          execSync(
            `tmux send-keys -t ${q(pane.tmuxTarget)} -l ${q(text)}`,
            { stdio: "ignore" }
          );
          // Send Enter in the background after a delay so TUI apps
          // like Claude Code have time to process the pasted text.
          const child = spawn(
            "sh",
            ["-c", `sleep 1 && tmux send-keys -t ${q(pane.tmuxTarget)} Enter`],
            { stdio: "ignore", detached: true }
          );
          child.unref();
          showMessage(`Sent to ${pane.displayName}`);
        } catch {
          showMessage(`Failed to send to ${pane.displayName}`);
        }
        setSendingValue("");
        setSendingPaneIndex(-1);
        setDetailMode("browse");
      }}
    />
  );

  const leftContent = (
    <Box flexDirection="column" flexGrow={1}>
      <SessionList
        sessions={sessions}
        selectedIndex={selectedIndex}
        dimmed={!active}
        expandedIndex={expandedIndex}
        hideDescription={showPreview}
        renderDetail={renderDetailPanel}
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

  if (showPreview) {
    return (
      <Box flexDirection="row">
        {leftContent}
        <PreviewPanel
          preview={previewData}
          width={previewWidth}
          height={previewHeight}
          scrollOffset={previewScroll}
        />
      </Box>
    );
  }

  return leftContent;
}
