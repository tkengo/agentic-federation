import React, { useState, useCallback, useRef, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { DetailPanel, useScripts, usePanes } from "./DetailPanel.js";
import type { DetailMode, ActionEntry } from "./DetailPanel.js";
import { PreviewPanel } from "./PreviewPanel.js";
import { StatusBadge } from "./StatusBadge.js";
import { useArtifacts } from "./ArtifactList.js";
import { usePreviewContent } from "../hooks/usePreviewContent.js";
import { useKeyboard } from "../hooks/useKeyboard.js";
import { useBlink } from "../hooks/useBlink.js";
import { useFooter } from "../contexts/FooterContext.js";
import { switchToTmuxSession } from "../utils/tmux.js";
import { shortenHome, formatAge } from "../utils/format.js";
import { STALE_THRESHOLD_SEC } from "../utils/types.js";
import type { SessionData } from "../utils/types.js";

interface SessionDetailProps {
  session: SessionData;
  columns: number;
  rows: number;
  headerHeight: number;
  refresh: () => void;
  onBack: () => void;
}

const SESSION_ACTIONS: ActionEntry[] = [
  { id: "attach", label: "Attach session", icon: "\u{1F4E5}" },  // inbox tray
  { id: "delete", label: "Delete session", icon: "\u{1F6D1}" },  // stop sign
];

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

  // Detail state
  const [detailIndex, setDetailIndex] = useState(0);
  const [detailMode, setDetailMode] = useState<DetailMode>("browse");
  const [confirmingScript, setConfirmingScript] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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

  // Preview panel state
  const [previewScroll, setPreviewScroll] = useState(0);

  // Data for session
  const artifacts = useArtifacts(session.sessionDir);
  const scripts = useScripts(session.sessionDir);
  const panes = usePanes(session.sessionDir);
  const totalDetailItems = artifacts.length + scripts.length + panes.length + SESSION_ACTIONS.length;

  // Preview content for selected detail item
  const previewData = usePreviewContent(
    session.sessionDir,
    artifacts,
    scripts,
    panes,
    detailIndex,
  );

  // Blink for waiting indicator
  const blinkOn = useBlink(500, session.waitingHuman.waiting);

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
      const scriptIdx = detailIndex - artifacts.length;
      const scriptDef = scripts[scriptIdx];
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
  }, [confirmingScript, confirmingDelete, detailIndex, artifacts.length, scripts, session.name, setOverride, clearOverride]);

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
    const scriptIdx = detailIndex - artifacts.length;
    const scriptDef = scripts[scriptIdx];
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
  }, [session, detailIndex, artifacts.length, scripts]);

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
        setDetailIndex((i) => Math.max(0, i - 1));
      },
      onDown: () => {
        setDetailIndex((i) => Math.min(Math.max(0, totalDetailItems - 1), i + 1));
      },
      onEnter: () => {
        if (detailIndex < artifacts.length) {
          // Open artifact in nvim
          const artifactName = artifacts[detailIndex]?.name;
          if (!artifactName) return;
          const artifactPath = path.join(session.sessionDir, "artifacts", artifactName);
          try {
            execSync(`nvim '${artifactPath}'`, { stdio: "inherit" });
            if (process.stdin.isTTY && process.stdin.setRawMode) {
              process.stdin.setRawMode(true);
            }
            process.stdout.write("\x1b[2J\x1b[H");
          } catch {
            showMessage(`Failed to open ${artifactName}`);
          }
        } else if (detailIndex < artifacts.length + scripts.length) {
          // Confirm script execution
          setConfirmingScript(true);
        } else if (detailIndex < artifacts.length + scripts.length + panes.length) {
          // Pane selected -> enter sending mode
          const paneIdx = detailIndex - artifacts.length - scripts.length;
          setSendingPaneIndex(paneIdx);
          setSendingValue("");
          setDetailMode("sending");
        } else {
          // Action selected
          const actionsStart = artifacts.length + scripts.length + panes.length;
          const actionIdx = detailIndex - actionsStart;
          const action = SESSION_ACTIONS[actionIdx];
          if (action?.id === "attach") {
            const ok = switchToTmuxSession(session.meta.tmux_session);
            if (ok) {
              showMessage(`Detached from ${session.name}`);
            } else {
              showMessage(`Failed to switch to ${session.name}`);
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
      if (previewData.type === "pane") return; // Pane preview: no manual scroll
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
          execSync(`fed stop '${session.name}'`, { stdio: "ignore" });
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
        onBack();
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

  // Sending mode: Esc to cancel (Enter handled by EmacsTextInput's onSubmit)
  useInput(
    (_input, key) => {
      if (key.escape) {
        setSendingValue("");
        setSendingPaneIndex(-1);
        setDetailMode("browse");
      }
    },
    { isActive: detailMode === "sending" }
  );

  // --- Render ---

  const sessionLabel = session.meta.repo
    ? `${session.meta.repo}/${session.meta.branch}`
    : session.name;

  const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {/* Session info line */}
      <Box>
        <Text bold color="cyan">{sessionLabel}</Text>
        <Text>{"  "}</Text>
        <Text>{session.workflow ?? "solo"}</Text>
        <Text>{"  "}</Text>
        <StatusBadge
          status={session.status}
          stale={isStale(session)}
          statusConfigMap={session.statusConfigMap}
          stateMtimeMs={session.stateMtimeMs}
        />
        {session.waitingHuman.waiting ? (
          <Text color="magenta" dimColor={!blinkOn}>{" [!]"}</Text>
        ) : (
          <Text>{"    "}</Text>
        )}
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
          artifacts={artifacts}
          scripts={scripts}
          panes={panes}
          actions={SESSION_ACTIONS}
          selectedIndex={detailIndex}
          maxVisible={dynamicMaxVisible}
          scriptName={runningScriptName ?? undefined}
          scriptExitCode={scriptExitCode}
          scriptKilled={scriptKilled}
          logLines={logLines}
          logScroll={logScroll}
          logMaxVisible={logMaxVisible}
          sendingPaneDisplayName={
            sendingPaneIndex >= 0 ? panes[sendingPaneIndex]?.displayName : undefined
          }
          sendingValue={sendingValue}
          onSendingChange={setSendingValue}
          onSendingSubmit={(text) => {
            if (!text.trim()) return;
            const pane = panes[sendingPaneIndex];
            if (!pane) return;
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
