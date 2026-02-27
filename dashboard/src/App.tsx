import React, { useState, useCallback, useMemo, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Header } from "./components/Header.js";
import { SessionList } from "./components/SessionList.js";
import { Preview } from "./components/Preview.js";
import { FeedbackInput } from "./components/FeedbackInput.js";
import { CreateSession } from "./components/CreateSession.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { Footer } from "./components/Footer.js";
import { Splash } from "./components/Splash.js";
import { useSessions } from "./hooks/useSessions.js";
import { useSessionWatcher } from "./hooks/useSessionWatcher.js";
import { useKeyboard } from "./hooks/useKeyboard.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { REPOS_DIR } from "./utils/types.js";
import type { SessionData } from "./utils/types.js";

type Screen = "splash" | "list" | "preview" | "feedback" | "create" | "palette";

export function App() {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const { sessions, refresh, refreshSessions, cleanableCount } = useSessions();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [screen, setScreen] = useState<Screen>("splash");
  const [message, setMessage] = useState<string | null>(null);
  const [createStep, setCreateStep] = useState<"workflow" | "repo" | "branch">("workflow");
  const [confirmingKill, setConfirmingKill] = useState(false);
  const [confirmingClean, setConfirmingClean] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const lastCtrlCRef = useRef(0);
  const [ctrlCPending, setCtrlCPending] = useState(false);

  // Read available repos from ~/.fed/repos/
  const repos = useMemo(() => {
    try {
      if (!fs.existsSync(REPOS_DIR)) return [];
      return fs
        .readdirSync(REPOS_DIR)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(/\.json$/, ""));
    } catch {
      return [];
    }
  }, []);

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

  // Approve / start orchestrator
  const approveSession = useCallback(() => {
    if (!selectedSession) return;
    const target = `${selectedSession.meta.tmux_session}:agent-team.1`;
    try {
      execSync(
        `tmux send-keys -t '${target}' '/start_orchestrator' Enter`,
        { stdio: "ignore" }
      );
      showMessage(`Sent /start_orchestrator to ${selectedSession.name}`);
    } catch {
      showMessage(`Failed to send to ${selectedSession.name}`);
    }
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
    (repo: string, branch: string, workflow?: string) => {
      try {
        const args = ["fed", "start", repo, branch, "--no-attach"];
        if (workflow) {
          args.push("--workflow", workflow);
        }
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
      onApprove: approveSession,
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
    },
    screen === "list" && !confirmingKill && !confirmingClean && !cleaning
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
      onApprove: approveSession,
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
      <Header sessionCount={sessions.length} cleanableCount={cleanableCount} />

      <Box
        borderStyle="single"
        borderTop={false}
        borderBottom={false}
        flexDirection="column"
        paddingY={0}
        flexGrow={1}
        overflow="hidden"
      >
        {/* Session list - visible on list, create, and palette screens */}
        {(screen === "list" || screen === "create" || screen === "palette") && (
          <>
            <SessionList
              sessions={sessions}
              selectedIndex={selectedIndex}
              dimmed={screen === "create" || screen === "palette"}
            />
            {hasCleanRow && (
              <Box paddingX={1} paddingTop={1}>
                <Text color={cleanRowSelected ? "cyan" : undefined} dimColor={!cleanRowSelected}>
                  {cleanRowSelected ? " > " : "   "}
                  {cleanableCount} worktrees to clean (Press Enter to clean up)
                </Text>
              </Box>
            )}
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
        {(screen === "create" || screen === "palette") && <Box flexGrow={1} />}

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
                case "approve":
                  approveSession();
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

        {/* Create panel - bottom-aligned */}
        {screen === "create" && (
          <CreateSession
            repos={repos}
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
        screen={screen}
        createStep={createStep}
        hasSelectedSession={!!selectedSession}
        cleanRowSelected={cleanRowSelected}
        confirmingClean={confirmingClean}
        cleanableCount={cleanableCount}
        cleaning={cleaning}
        confirmingKill={confirmingKill}
        killTargetName={selectedSession?.name}
        ctrlCPending={ctrlCPending}
      />
    </Box>
  );
}
