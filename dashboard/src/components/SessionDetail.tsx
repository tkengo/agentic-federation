import React, { useState, useCallback, useRef, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { DetailPanel, useScripts } from "./DetailPanel.js";
import type { DetailMode, ActionEntry } from "./DetailPanel.js";
import { PreviewPanel } from "./PreviewPanel.js";
import { StatusBadge } from "./StatusBadge.js";
import { usePreviewContent } from "../hooks/usePreviewContent.js";
import { useKeyboard } from "../hooks/useKeyboard.js";
import { useFooter } from "../contexts/FooterContext.js";
import { switchToTmuxSession } from "../utils/tmux.js";
import { shortenHome, formatAge } from "../utils/format.js";
import { STALE_THRESHOLD_SEC } from "../utils/types.js";
import { PROTECTED_WORKTREES_FILE } from "../utils/types.js";
import type { SessionData } from "../utils/types.js";

interface SessionDetailProps {
  session: SessionData;
  columns: number;
  rows: number;
  headerHeight: number;
  refresh: () => void;
  onBack: () => void;
}

function checkWorktreeProtected(worktreePath: string): boolean {
  try {
    const data = JSON.parse(
      fs.readFileSync(PROTECTED_WORKTREES_FILE, "utf-8")
    );
    return Array.isArray(data?.paths) && data.paths.includes(worktreePath);
  } catch {
    return false;
  }
}

function isStale(session: SessionData): boolean {
  if (session.stateMtimeMs == null) return false;
  return (Date.now() - session.stateMtimeMs) / 1000 >= STALE_THRESHOLD_SEC;
}

export function SessionDetail({
  session,
  columns,
  rows,
  headerHeight,
  refresh,
  onBack,
}: SessionDetailProps) {
  const { showMessage, setOverride, clearOverride } = useFooter();

  // Worktree protection state
  const [worktreeProtected, setWorktreeProtected] = useState(() =>
    session.meta.worktree ? checkWorktreeProtected(session.meta.worktree) : false
  );

  const sessionActions: ActionEntry[] = React.useMemo(() => {
    const actions: ActionEntry[] = [
      { id: "attach", label: "Attach session", icon: "\u{1F4E5}" },
    ];
    if (session.meta.worktree) {
      actions.push(
        worktreeProtected
          ? { id: "unprotect", label: "Unprotect worktree", icon: "\u{1F513}" }
          : { id: "protect", label: "Protect worktree", icon: "\u{1F512}" }
      );
    }
    actions.push({ id: "delete", label: "Delete session", icon: "\u{1F6D1}" });
    return actions;
  }, [worktreeProtected, session.meta.worktree]);

  // Detail state
  const [detailIndex, setDetailIndex] = useState(0);
  const [detailMode, setDetailMode] = useState<DetailMode>("browse");
  const [confirmingScript, setConfirmingScript] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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

  // Preview panel state
  const [previewScroll, setPreviewScroll] = useState(0);

  // Data for session
  const scripts = useScripts(session.sessionDir);
  const totalDetailItems = scripts.length + sessionActions.length;

  // Preview content for selected detail item
  const previewData = usePreviewContent(
    scripts,
    detailIndex,
  );

  // Reset preview scroll when detail selection changes
  const prevDetailIndexRef = useRef(detailIndex);
  useEffect(() => {
    if (prevDetailIndexRef.current !== detailIndex) {
      setPreviewScroll(0);
      prevDetailIndexRef.current = detailIndex;
    }
  }, [detailIndex]);

  // Report footer override to parent
  useEffect(() => {
    if (confirmingScript) {
      const scriptDef = scripts[detailIndex];
      if (scriptDef) {
        setOverride({ type: "confirmScript", name: scriptDef.name });
      } else {
        clearOverride();
      }
    } else if (confirmingDelete) {
      setOverride({ type: "confirmDeleteSession", name: session.name });
    } else {
      clearOverride();
    }
  }, [confirmingScript, confirmingDelete, detailIndex, scripts, session.name, setOverride, clearOverride]);

  // Clear footer override on unmount
  useEffect(() => {
    return () => {
      clearOverride();
    };
  }, [clearOverride]);

  // Cleanup script state on unmount
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

  // Run a script
  const runScript = useCallback(() => {
    const scriptDef = scripts[detailIndex];
    if (!scriptDef) return;

    const sessionDir = session.sessionDir;
    const sessionName = session.meta.tmux_session;

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
            setLogScroll(Math.max(0, lines.length - logMaxVisible));
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
  }, [session, detailIndex, scripts]);

  // Kill a running script
  const killScript = useCallback(() => {
    if (scriptProcessRef.current) {
      setScriptKilled(true);
      scriptProcessRef.current.kill("SIGTERM");
    }
  }, []);

  // --- Layout calculations ---

  // Available content width: columns - outerBorder(2) - paddingX(2)
  const contentWidth = columns - 4;

  // Detail panel: 35% of content, min 30, max 55
  const detailWidth = Math.max(30, Math.min(55, Math.floor(contentWidth * 0.35)));

  // Preview panel: remaining width minus gap(1)
  const previewWidth = Math.max(20, contentWidth - detailWidth - 1);

  // Panel height: rows - header - footer(2) - sessionInfo lines - blank lines
  const hasDescription = !!session.description;
  // Session info line(1) + worktree line(1) + description(0 or 1) + blank(1)
  const infoLines = 2 + (hasDescription ? 1 : 0) + 1;
  const panelHeight = Math.max(5, rows - headerHeight - 2 - infoLines);

  // Dynamic MAX_VISIBLE for browse mode based on panel height
  // Panel height includes border(2) + worktreeHeader(0 for detail screen, worktree shown above)
  // So visible rows = panelHeight - border(2)
  const dynamicMaxVisible = Math.max(5, panelHeight - 2);

  // Dynamic logMaxVisible: panel height - border(2) - header line(1)
  const logMaxVisible = Math.max(5, panelHeight - 3);

  // --- Keyboard handlers ---

  // Browse mode
  useKeyboard(
    {
      onUp: () => {
        setDetailIndex((i) => (i <= 0 ? Math.max(0, totalDetailItems - 1) : i - 1));
      },
      onDown: () => {
        setDetailIndex((i) => (i >= Math.max(0, totalDetailItems - 1) ? 0 : i + 1));
      },
      onEnter: () => {
        if (detailIndex < scripts.length) {
          // Confirm script execution
          setConfirmingScript(true);
        } else {
          // Action selected
          const actionIdx = detailIndex - scripts.length;
          const action = sessionActions[actionIdx];
          if (action?.id === "attach") {
            if (!session.tmuxAlive) {
              // Recover tmux session first
              try {
                execSync(`fed session recover '${session.name}' --no-attach`, { stdio: "ignore" });
                showMessage(`Recovered: ${session.name}`);
                refresh();
              } catch {
                showMessage(`Failed to recover ${session.name}`);
                return;
              }
            }
            const ok = switchToTmuxSession(session.meta.tmux_session);
            if (ok) {
              showMessage(`Detached from ${session.name}`);
            } else {
              showMessage(`Failed to switch to ${session.name}`);
            }
          } else if (action?.id === "protect") {
            try {
              execSync(`fed worktree protect '${session.meta.repo}' '${session.meta.branch}'`, { stdio: "ignore" });
              showMessage("Worktree protected");
              setWorktreeProtected(true);
            } catch {
              showMessage("Failed to protect worktree");
            }
          } else if (action?.id === "unprotect") {
            try {
              execSync(`fed worktree unprotect '${session.meta.repo}' '${session.meta.branch}'`, { stdio: "ignore" });
              showMessage("Worktree unprotected");
              setWorktreeProtected(false);
            } catch {
              showMessage("Failed to unprotect worktree");
            }
          } else if (action?.id === "delete") {
            setConfirmingDelete(true);
          }
        }
      },
      onSpace: () => {
        onBack();
      },
      onBack: () => {
        onBack();
      },
    },
    detailMode === "browse" && !confirmingScript && !confirmingDelete
  );

  // Preview scroll in browse mode (Ctrl+U / Ctrl+D)
  useInput(
    (input, key) => {
      const previewContentHeight = Math.max(1, panelHeight - 2);
      const maxScroll = Math.max(0, previewData.lines.length - previewContentHeight);
      if (key.ctrl && input === "u") {
        setPreviewScroll((s) => Math.max(0, s - previewContentHeight));
      } else if (key.ctrl && input === "d") {
        setPreviewScroll((s) => Math.min(maxScroll, s + previewContentHeight));
      }
    },
    { isActive: detailMode === "browse" && !confirmingScript && !confirmingDelete }
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
    { isActive: confirmingScript }
  );

  // Delete confirmation handler
  useInput(
    (_input) => {
      if (_input === "y" || _input === "Y") {
        setConfirmingDelete(false);
        try {
          execSync(`fed session stop '${session.name}'`, { stdio: "ignore" });
          showMessage(`Stopped: ${session.name}`);
          refresh();
        } catch {
          showMessage(`Failed to stop ${session.name}`);
        }
        onBack();
      } else {
        setConfirmingDelete(false);
      }
    },
    { isActive: confirmingDelete }
  );

  // Script running mode keyboard handler
  useInput(
    (input, key) => {
      const isUp = key.upArrow || input === "k" || (key.ctrl && input === "p");
      const isDown = key.downArrow || input === "j" || (key.ctrl && input === "n");
      const isPageUp = key.ctrl && input === "u";
      const isPageDown = key.ctrl && input === "d";
      const maxScroll = Math.max(0, logLines.length - logMaxVisible);

      if (key.escape) {
        killScript();
      } else if (isPageUp) {
        autoScrollRef.current = false;
        setLogScroll((s) => Math.max(0, s - logMaxVisible));
      } else if (isPageDown) {
        setLogScroll((s) => {
          const next = Math.min(maxScroll, s + logMaxVisible);
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
    { isActive: detailMode === "running" }
  );

  // Script done mode keyboard handler
  useInput(
    (input, key) => {
      const isUp = key.upArrow || input === "k" || (key.ctrl && input === "p");
      const isDown = key.downArrow || input === "j" || (key.ctrl && input === "n");
      const isPageUp = key.ctrl && input === "u";
      const isPageDown = key.ctrl && input === "d";
      const maxScroll = Math.max(0, logLines.length - logMaxVisible);

      if (key.escape || input === " ") {
        // Return to browse mode (session detail list) instead of session list
        setLogLines([]);
        setLogScroll(0);
        setScriptExitCode(null);
        setScriptKilled(false);
        setRunningScriptName(null);
        setDetailMode("browse");
      } else if (isPageUp) {
        setLogScroll((s) => Math.max(0, s - logMaxVisible));
      } else if (isPageDown) {
        setLogScroll((s) => Math.min(maxScroll, s + logMaxVisible));
      } else if (isUp) {
        setLogScroll((s) => Math.max(0, s - 1));
      } else if (isDown) {
        setLogScroll((s) => Math.min(maxScroll, s + 1));
      }
    },
    { isActive: detailMode === "done" }
  );

  // --- Render ---

  const sessionLabel = session.meta.repo
    ? `${session.meta.repo}/${session.meta.branch}`
    : session.name;

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {/* Session info line */}
      <Box>
        <Text bold color="cyan">{sessionLabel}</Text>
        <Text>{"  "}</Text>
        <Text>{session.workflow ?? "solo"}</Text>
        <Text>{"  "}</Text>
        <StatusBadge
          status={session.tmuxAlive ? session.status : "disconnected"}
          currentStep={session.tmuxAlive ? session.currentStep : null}
          stale={isStale(session)}
          stateMtimeMs={session.stateMtimeMs}
        />
        <Text>{"  "}</Text>
        <Text dimColor>{formatAge(session.meta.created_at)}</Text>
      </Box>

      {/* Worktree path */}
      {session.meta.worktree && (
        <Text dimColor>{shortenHome(session.meta.worktree)}</Text>
      )}

      {/* Description */}
      {session.description && (
        <Text>{session.description}</Text>
      )}

      {/* Blank line before panels */}
      <Text>{" "}</Text>

      {/* Detail + Preview panels side by side */}
      <Box flexDirection="row" height={panelHeight} gap={1}>
        <DetailPanel
          width={detailWidth}
          height={panelHeight}
          mode={detailMode}
          scripts={scripts}
          actions={sessionActions}
          selectedIndex={detailIndex}
          maxVisible={dynamicMaxVisible}
          scriptName={runningScriptName ?? undefined}
          scriptExitCode={scriptExitCode}
          scriptKilled={scriptKilled}
          logLines={logLines}
          logScroll={logScroll}
          logMaxVisible={logMaxVisible}
        />
        <PreviewPanel
          preview={previewData}
          width={previewWidth}
          height={panelHeight}
          scrollOffset={previewScroll}
        />
      </Box>
    </Box>
  );
}
