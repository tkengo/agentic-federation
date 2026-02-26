import React, { useState, useCallback } from "react";
import { Box, Text, useApp } from "ink";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { Header } from "./components/Header.js";
import { SessionList } from "./components/SessionList.js";
import { Preview } from "./components/Preview.js";
import { FeedbackInput } from "./components/FeedbackInput.js";
import { Footer } from "./components/Footer.js";
import { useSessions } from "./hooks/useSessions.js";
import { useSessionWatcher } from "./hooks/useSessionWatcher.js";
import { useKeyboard } from "./hooks/useKeyboard.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import type { SessionData } from "./utils/types.js";

type Screen = "list" | "preview" | "feedback";

export function App() {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const { sessions, refresh } = useSessions();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [screen, setScreen] = useState<Screen>("list");
  const [message, setMessage] = useState<string | null>(null);

  // Watch for file changes
  useSessionWatcher(refresh);

  const selectedSession: SessionData | undefined = sessions[selectedIndex];

  // Clamp selectedIndex if sessions list changed
  if (selectedIndex >= sessions.length && sessions.length > 0) {
    setSelectedIndex(sessions.length - 1);
  }

  const showMessage = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }, []);

  // Switch to tmux session
  const switchToSession = useCallback(() => {
    if (!selectedSession) return;
    try {
      execSync(
        `tmux switch-client -t '${selectedSession.meta.tmux_session}'`,
        { stdio: "ignore" }
      );
    } catch {
      showMessage(`Failed to switch to ${selectedSession.name}`);
    }
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

  // Long feedback via $EDITOR
  const longFeedback = useCallback(() => {
    if (!selectedSession) return;
    showMessage("Use: fed feedback write (from session terminal)");
  }, [selectedSession, showMessage]);

  // Keyboard bindings for list screen
  useKeyboard(
    {
      onUp: () => {
        setSelectedIndex((i) => Math.max(0, i - 1));
      },
      onDown: () => {
        setSelectedIndex((i) => Math.min(sessions.length - 1, i + 1));
      },
      onEnter: switchToSession,
      onPreview: () => {
        if (selectedSession) setScreen("preview");
      },
      onApprove: approveSession,
      onFeedback: () => {
        if (selectedSession) setScreen("feedback");
      },
      onLongFeedback: longFeedback,
      onKill: killSession,
      onQuit: () => exit(),
    },
    screen === "list"
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

  // Title for header
  const headerTitle =
    screen === "preview" && selectedSession
      ? `${selectedSession.meta.repo}/${selectedSession.meta.branch} > preview (${selectedSession.status})`
      : screen === "feedback" && selectedSession
        ? `${selectedSession.meta.repo}/${selectedSession.meta.branch} > feedback`
        : "fed dashboard";

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Header sessionCount={sessions.length} title={headerTitle} />

      <Box
        borderStyle="single"
        borderTop={false}
        borderBottom={false}
        flexDirection="column"
        paddingY={0}
        flexGrow={1}
        overflow="hidden"
      >
        {screen === "list" && (
          <SessionList sessions={sessions} selectedIndex={selectedIndex} />
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
      </Box>

      {/* Status info for selected session */}
      {screen === "list" && selectedSession && (
        <Box
          borderStyle="single"
          borderTop={false}
          borderBottom={false}
          paddingX={1}
        >
          <Text>
            <Text bold>{selectedSession.name}</Text>
            {selectedSession.pendingReviews.length > 0 && (
              <Text dimColor>
                {" | "}
                {selectedSession.pendingReviews.join(", ")}
              </Text>
            )}
            {selectedSession.escalation.required && (
              <Text color="magenta">
                {" | Escalation: "}
                {selectedSession.escalation.reason ?? "required"}
              </Text>
            )}
          </Text>
        </Box>
      )}

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

      <Footer screen={screen} />
    </Box>
  );
}
