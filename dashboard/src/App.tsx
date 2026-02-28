import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Header } from "./components/Header.js";
import { SessionList } from "./components/SessionList.js";
import { Preview } from "./components/Preview.js";
import { FeedbackInput } from "./components/FeedbackInput.js";
import { CreateSession } from "./components/CreateSession.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { Footer } from "./components/Footer.js";
import { Splash } from "./components/Splash.js";
import { DetailPanel, useScripts, LOG_MAX_VISIBLE } from "./components/DetailPanel.js";
import type { DetailMode } from "./components/DetailPanel.js";
import { AddRepo } from "./components/AddRepo.js";
import { RepoList } from "./components/RepoList.js";
import { WorkflowList } from "./components/WorkflowList.js";
import { useSessions } from "./hooks/useSessions.js";
import { useSessionWatcher } from "./hooks/useSessionWatcher.js";
import { useKeyboard } from "./hooks/useKeyboard.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { useArtifacts } from "./components/ArtifactList.js";
import { REPOS_DIR } from "./utils/types.js";
import type { SessionData, RepoInfo } from "./utils/types.js";

type Screen = "splash" | "list" | "preview" | "feedback" | "create" | "palette" | "add-repo";

export function App() {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const { sessions, refresh, refreshSessions, cleanableCount } = useSessions();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [screen, setScreen] = useState<Screen>("splash");
  const [message, setMessage] = useState<string | null>(null);
  const [createStep, setCreateStep] = useState<"workflow" | "repo" | "branch">("workflow");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [detailIndex, setDetailIndex] = useState(0);
  const [detailMode, setDetailMode] = useState<DetailMode>("browse");
  const [confirmingScript, setConfirmingScript] = useState(false);
  const [confirmingKill, setConfirmingKill] = useState(false);
  const [confirmingClean, setConfirmingClean] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const lastCtrlCRef = useRef(0);
  const [ctrlCPending, setCtrlCPending] = useState(false);

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

  // Load repos from ~/.fed/repos/ with config details
  const loadRepos = useCallback((): RepoInfo[] => {
    try {
      if (!fs.existsSync(REPOS_DIR)) return [];
      return fs
        .readdirSync(REPOS_DIR)
        .filter((f) => f.endsWith(".json"))
        .map((f) => {
          const name = f.replace(/\.json$/, "");
          try {
            const raw = JSON.parse(fs.readFileSync(path.join(REPOS_DIR, f), "utf-8"));
            const repoRoot = path.join(raw.base_path, `${raw.repo_name}-workspace`, "main");
            return { name, repoRoot };
          } catch {
            return { name, repoRoot: "" };
          }
        });
    } catch {
      return [];
    }
  }, []);

  const [repos, setRepos] = useState<RepoInfo[]>(loadRepos);

  const refreshRepos = useCallback(() => {
    setRepos(loadRepos());
  }, [loadRepos]);

  // Read available workflows from workflows/ directory with descriptions
  const workflows = useMemo(() => {
    try {
      const dashboardDir = path.dirname(fileURLToPath(import.meta.url));
      const workflowsDir = path.resolve(dashboardDir, "../../workflows");
      if (!fs.existsSync(workflowsDir)) return [];
      return fs
        .readdirSync(workflowsDir)
        .filter((d) => {
          const dirPath = path.join(workflowsDir, d);
          return fs.statSync(dirPath).isDirectory()
            && fs.existsSync(path.join(dirPath, "workflow.yaml"));
        })
        .map((d) => {
          let description = "";
          try {
            const content = fs.readFileSync(path.join(workflowsDir, d, "workflow.yaml"), "utf-8");
            const match = content.match(/^description:\s*"?([^"\n]+)"?\s*$/m);
            if (match) description = match[1]!.trim();
          } catch { /* ignore */ }
          return { name: d, description };
        });
    } catch {
      return [];
    }
  }, []);

  // Watch for file changes (lightweight: session list only, no cleanable count)
  useSessionWatcher(refreshSessions);

  // Clean row is an extra selectable item after the session list
  const hasCleanRow = cleanableCount > 0;
  const maxIndex = sessions.length - 1 + (hasCleanRow ? 1 : 0);
  const cleanRowSelected = hasCleanRow && selectedIndex === sessions.length;
  const selectedSession: SessionData | undefined = sessions[selectedIndex];

  // Clamp selectedIndex if list changed
  if (selectedIndex > maxIndex && maxIndex >= 0) {
    setSelectedIndex(maxIndex);
  }

  const showMessage = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }, []);

  // Data for expanded session
  const expandedSession = expandedIndex !== null ? sessions[expandedIndex] : undefined;
  const expandedArtifacts = useArtifacts(expandedSession?.sessionDir ?? "");
  const expandedScripts = useScripts(expandedSession?.sessionDir ?? "");
  const totalDetailItems = expandedArtifacts.length + expandedScripts.length;

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

  // Switch to tmux session (attach if outside tmux, switch-client if inside)
  const switchToSession = useCallback(() => {
    if (!selectedSession) return;
    const target = selectedSession.meta.tmux_session;
    const insideTmux = !!process.env.TMUX;
    try {
      if (insideTmux) {
        execSync(`tmux switch-client -t '${target}'`, { stdio: "ignore" });
      } else {
        execSync(`tmux attach-session -t '${target}'`, { stdio: "inherit" });
        // Restore terminal state after tmux detach
        if (process.stdin.isTTY && process.stdin.setRawMode) {
          process.stdin.setRawMode(true);
        }
        process.stdout.write("\x1b[2J\x1b[H");
      }
    } catch {
      showMessage(`Failed to switch to ${selectedSession.name}`);
    }
    // Trigger re-render after returning from tmux
    showMessage(`Detached from ${selectedSession.name}`);
  }, [selectedSession, showMessage]);

  // Send short feedback via tmux send-keys
  const sendFeedback = useCallback(
    (text: string) => {
      if (!selectedSession) return;

      // Write feedback to session's human_feedback.md
      const feedbackPath = path.join(
        selectedSession.sessionDir,
        "human_feedback.md"
      );
      const timestamp = new Date().toISOString();
      const entry = `\n## [${timestamp}]\n\n${text}\n`;
      fs.appendFileSync(feedbackPath, entry);

      showMessage(`Feedback sent to ${selectedSession.name}`);
      setScreen("list");
    },
    [selectedSession, showMessage]
  );

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
  const runClean = useCallback(() => {
    setCleaning(true);
    // Defer so the "Cleaning..." UI renders before the blocking execSync
    setTimeout(() => {
      try {
        const output = execSync("fed clean", { encoding: "utf-8" });
        const doneLine = output.match(/^Done\. (.+)$/m);
        showMessage(doneLine ? doneLine[1] : "Cleaned worktrees");
        refresh();
      } catch (err: unknown) {
        // fed clean exits 1 on partial failure but still produces output
        const output = (err as { stdout?: string }).stdout ?? "";
        const doneLine = output.match(/^Done\. (.+)$/m);
        showMessage(doneLine ? doneLine[1] : "Failed to clean worktrees");
        refresh();
      }
      setCleaning(false);
    }, 50);
  }, [showMessage, refresh]);

  // Long feedback via $EDITOR
  const longFeedback = useCallback(() => {
    if (!selectedSession) return;
    showMessage("Use: fed feedback write (from session terminal)");
  }, [selectedSession, showMessage]);

  // Create new session via fed start --no-attach
  const createSession = useCallback(
    (repo: string, branch: string, workflow: string) => {
      try {
        const args = ["fed", "start", workflow, repo, branch, "--no-attach"];
        execSync(args.join(" "), { stdio: "inherit" });
        // Restore terminal state after fed start
        if (process.stdin.isTTY && process.stdin.setRawMode) {
          process.stdin.setRawMode(true);
        }
        process.stdout.write("\x1b[2J\x1b[H");
        refresh();
        showMessage(`Created session: ${branch}`);
      } catch {
        // Restore terminal state even on error
        if (process.stdin.isTTY && process.stdin.setRawMode) {
          process.stdin.setRawMode(true);
        }
        process.stdout.write("\x1b[2J\x1b[H");
        showMessage(`Failed to create session: ${branch}`);
      }
      setScreen("list");
    },
    [refresh, showMessage]
  );

  // Add a new repo via fed repo add
  const addRepo = useCallback(
    (cloneUrl: string, basePath: string) => {
      try {
        const args = ["fed", "repo", "add", `'${cloneUrl}'`];
        if (basePath && basePath !== "~/fed/repos") {
          args.push(`'${basePath}'`);
        }
        execSync(args.join(" "), { stdio: "inherit" });
        // Restore terminal state
        if (process.stdin.isTTY && process.stdin.setRawMode) {
          process.stdin.setRawMode(true);
        }
        process.stdout.write("\x1b[2J\x1b[H");
        refreshRepos();
        showMessage("Repository added successfully");
      } catch {
        if (process.stdin.isTTY && process.stdin.setRawMode) {
          process.stdin.setRawMode(true);
        }
        process.stdout.write("\x1b[2J\x1b[H");
        showMessage("Failed to add repository");
      }
      setScreen("list");
    },
    [showMessage, refreshRepos]
  );

  // Run a script from the expanded session via `fed repo-script run`
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

    // Delegate to `fed repo-script run` — path resolution, env injection, cwd all handled by CLI
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
      // Flush pending log update
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

  // Derive confirm script name for footer
  const confirmScriptName = confirmingScript && expandedScripts.length > 0
    ? expandedScripts[detailIndex - expandedArtifacts.length]?.name ?? ""
    : "";

  // Global Ctrl+C double-press to quit
  useInput(
    (input, key) => {
      if (input === "c" && key.ctrl) {
        const now = Date.now();
        if (now - lastCtrlCRef.current < 1000) {
          exit();
        } else {
          lastCtrlCRef.current = now;
          setCtrlCPending(true);
          setTimeout(() => setCtrlCPending(false), 1000);
        }
      }
    },
    { isActive: !cleaning }
  );

  // Keyboard bindings for expanded browse mode
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
        } else {
          // Confirm script execution
          setConfirmingScript(true);
        }
      },
      onSpace: () => {
        setExpandedIndex(null);
      },
      onBack: () => {
        setExpandedIndex(null);
      },
    },
    screen === "list" && expandedIndex !== null && detailMode === "browse"
      && !confirmingScript && !confirmingKill && !confirmingClean && !cleaning
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
    { isActive: screen === "list" && expandedIndex !== null && confirmingScript }
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
    { isActive: screen === "list" && expandedIndex !== null && detailMode === "running" }
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
        // Back to browse mode
        setDetailMode("browse");
        setLogLines([]);
        setLogScroll(0);
        setRunningScriptName(null);
        setScriptExitCode(null);
        setScriptKilled(false);
        logBufferRef.current = "";
        autoScrollRef.current = true;
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
    { isActive: screen === "list" && expandedIndex !== null && detailMode === "done" }
  );

  // Keyboard bindings for list screen
  useKeyboard(
    {
      onUp: () => {
        setSelectedIndex((i) => Math.max(0, i - 1));
      },
      onDown: () => {
        setSelectedIndex((i) => Math.min(maxIndex, i + 1));
      },
      onEnter: cleanRowSelected ? () => setConfirmingClean(true) : switchToSession,
      onPreview: () => {
        if (selectedSession) setScreen("preview");
      },
      onFeedback: () => {
        if (selectedSession) setScreen("feedback");
      },
      onLongFeedback: longFeedback,
      onStop: () => {
        if (selectedSession) setConfirmingKill(true);
      },
      onCreate: () => {
        setCreateStep("workflow");
        setScreen("create");
      },
      onPalette: () => {
        setScreen("palette");
      },
      onAddRepo: () => {
        setScreen("add-repo");
      },
      onSpace: () => {
        if (selectedSession) {
          setExpandedIndex(selectedIndex);
          setDetailIndex(0);
        }
      },
    },
    screen === "list" && expandedIndex === null && !confirmingKill && !confirmingClean && !cleaning
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
    { isActive: screen === "list" && confirmingKill && !cleaning }
  );

  // Clean confirmation handler
  useInput(
    (_input) => {
      if (_input === "y" || _input === "Y") {
        setConfirmingClean(false);
        runClean();
      } else {
        setConfirmingClean(false);
      }
    },
    { isActive: screen === "list" && confirmingClean && !cleaning }
  );

  // Keyboard bindings for preview screen
  useKeyboard(
    {
      onBack: () => setScreen("list"),
      onQuit: () => setScreen("list"),
      onFeedback: () => setScreen("feedback"),
      onEnter: switchToSession,
    },
    screen === "preview"
  );

  if (screen === "splash") {
    return (
      <Splash
        columns={columns}
        rows={rows}
        onDone={() => setScreen("list")}
      />
    );
  }

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Header sessionCount={sessions.length} cleanableCount={cleanableCount} repoCount={repos.length} workflowCount={workflows.length} />

      <Box
        borderStyle="single"
        borderTop={false}
        borderBottom={false}
        flexDirection="column"
        paddingY={0}
        flexGrow={1}
        overflow="hidden"
      >
        {/* Session list - visible on list, create, palette, and add-repo screens */}
        {(screen === "list" || screen === "create" || screen === "palette" || screen === "add-repo") && (
          <>
            <SessionList
              sessions={sessions}
              selectedIndex={selectedIndex}
              dimmed={screen === "create" || screen === "palette" || screen === "add-repo"}
              expandedIndex={expandedIndex}
              renderDetail={(session, colWidths) => (
                <DetailPanel
                  colWidths={colWidths}
                  description={session.description}
                  mode={detailMode}
                  artifacts={expandedArtifacts}
                  scripts={expandedScripts}
                  selectedIndex={detailIndex}
                  scriptName={runningScriptName ?? undefined}
                  scriptExitCode={scriptExitCode}
                  scriptKilled={scriptKilled}
                  logLines={logLines}
                  logScroll={logScroll}
                />
              )}
            />
            {hasCleanRow && (
              <Box paddingX={1} paddingTop={1}>
                <Text color={cleanRowSelected ? "cyan" : undefined} dimColor={!cleanRowSelected}>
                  {cleanRowSelected ? " > " : "   "}
                  {cleanableCount} worktrees to clean (Press Enter to clean up)
                </Text>
              </Box>
            )}

            {/* Section margin (2 empty lines between sessions and repos) */}
            <Text>{" "}</Text>
            <Text>{" "}</Text>

            <RepoList
              repos={repos}
              dimmed={screen === "create" || screen === "palette" || screen === "add-repo"}
            />

            {/* Section margin (2 empty lines between repos and workflows) */}
            <Text>{" "}</Text>
            <Text>{" "}</Text>

            <WorkflowList
              workflows={workflows}
              dimmed={screen === "create" || screen === "palette" || screen === "add-repo"}
            />
          </>
        )}

        {screen === "preview" && selectedSession && (
          <Preview session={selectedSession} />
        )}

        {screen === "feedback" && selectedSession && (
          <FeedbackInput
            session={selectedSession}
            onSubmit={sendFeedback}
            onCancel={() => setScreen("list")}
          />
        )}

        {/* Spacer pushes panels to bottom */}
        {(screen === "create" || screen === "palette" || screen === "add-repo") && <Box flexGrow={1} />}

        {/* Command palette - bottom-aligned */}
        {screen === "palette" && (
          <CommandPalette
            sessionName={selectedSession?.name}
            hasSession={!!selectedSession}
            onClose={() => setScreen("list")}
            onAction={(cmdId) => {
              setScreen("list");
              switch (cmdId) {
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
            }}
            onScreenTransition={(cmdId) => {
              switch (cmdId) {
                case "preview":
                  if (selectedSession) setScreen("preview");
                  break;
                case "feedback":
                  if (selectedSession) setScreen("feedback");
                  break;
                case "new":
                  setCreateStep("workflow");
                  setScreen("create");
                  break;
                default:
                  setScreen("list");
              }
            }}
            showMessage={showMessage}
          />
        )}

        {/* Add repo panel - bottom-aligned */}
        {screen === "add-repo" && (
          <AddRepo
            onSubmit={addRepo}
            onCancel={() => setScreen("list")}
          />
        )}

        {/* Create panel - bottom-aligned */}
        {screen === "create" && (
          <CreateSession
            repos={repos.map((r) => r.name)}
            workflows={workflows}
            sessions={sessions}
            onSubmit={createSession}
            onCancel={() => setScreen("list")}
            onStepChange={setCreateStep}
          />
        )}
      </Box>

      {/* Message bar */}
      {message && (
        <Box
          borderStyle="single"
          borderTop={false}
          borderBottom={false}
          paddingX={1}
        >
          <Text color="green">{message}</Text>
        </Box>
      )}

      <Footer
        confirmingClean={confirmingClean}
        cleanableCount={cleanableCount}
        cleaning={cleaning}
        confirmingKill={confirmingKill}
        killTargetName={selectedSession?.name}
        ctrlCPending={ctrlCPending}
        confirmingScript={confirmingScript}
        confirmScriptName={confirmScriptName}
      />
    </Box>
  );
}
