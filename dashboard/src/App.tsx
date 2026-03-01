import React, { useState, useCallback, useMemo, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Header } from "./components/Header.js";
import { Home } from "./components/Home.js";
import { CreateSession } from "./components/CreateSession.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { Footer } from "./components/Footer.js";
import { Splash } from "./components/Splash.js";
import { AddRepo } from "./components/AddRepo.js";
import { useSessions } from "./hooks/useSessions.js";
import { useSessionWatcher } from "./hooks/useSessionWatcher.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { REPOS_DIR } from "./utils/types.js";
import type { SessionData, RepoInfo, FooterOverride, WorkflowInfo } from "./utils/types.js";

type Screen = "splash" | "list" | "create" | "palette" | "add-repo";

export function App() {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const { sessions, refresh, refreshSessions, cleanableCount } = useSessions();
  const [screen, setScreen] = useState<Screen>("splash");
  const [message, setMessage] = useState<string | null>(null);
  const [createStep, setCreateStep] = useState<"workflow" | "repo" | "branch">("workflow");
  const lastCtrlCRef = useRef(0);
  const [ctrlCPending, setCtrlCPending] = useState(false);

  // Active session reported by Home (used by FeedbackInput, CommandPalette)
  const [activeSession, setActiveSession] = useState<SessionData | undefined>();

  // Footer override from Home (confirmation dialogs, cleaning state)
  const [footerOverride, setFooterOverride] = useState<FooterOverride>(null);

  // Pending action from CommandPalette to Home
  const [pendingHomeAction, setPendingHomeAction] = useState<string | null>(null);

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
  const workflows: WorkflowInfo[] = useMemo(() => {
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

  const showMessage = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }, []);

  // Create new session via fed start --no-attach
  const createSession = useCallback(
    (repo: string, branch: string, workflow: string) => {
      try {
        const args = ["fed", "start", workflow, repo, branch, "--no-attach"];
        execSync(args.join(" "), { stdio: "inherit" });
        if (process.stdin.isTTY && process.stdin.setRawMode) {
          process.stdin.setRawMode(true);
        }
        process.stdout.write("\x1b[2J\x1b[H");
        refresh();
        showMessage(`Created session: ${branch}`);
      } catch {
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
    { isActive: footerOverride?.type !== "cleaning" }
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
        {/* Home screen - visible on list, create, palette, and add-repo screens */}
        {(screen === "list" || screen === "create" || screen === "palette" || screen === "add-repo") && (
          <Home
            sessions={sessions}
            repos={repos}
            workflows={workflows}
            cleanableCount={cleanableCount}
            active={screen === "list"}
            showMessage={showMessage}
            refresh={refresh}
            refreshRepos={refreshRepos}
            onNavigate={(target) => {
              if (target === "create") setCreateStep("workflow");
              setScreen(target);
            }}
            onSelectedSessionChange={setActiveSession}
            onFooterOverrideChange={setFooterOverride}
            pendingAction={pendingHomeAction}
            onActionHandled={() => setPendingHomeAction(null)}
          />
        )}

        {/* Spacer pushes panels to bottom */}
        {(screen === "create" || screen === "palette" || screen === "add-repo") && <Box flexGrow={1} />}

        {/* Command palette - bottom-aligned */}
        {screen === "palette" && (
          <CommandPalette
            sessionName={activeSession?.name}
            hasSession={!!activeSession}
            onClose={() => setScreen("list")}
            onAction={(cmdId) => {
              setScreen("list");
              setPendingHomeAction(cmdId);
            }}
            onScreenTransition={(cmdId) => {
              switch (cmdId) {
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

      <Footer
        override={footerOverride}
        message={message}
        ctrlCPending={ctrlCPending}
      />
    </Box>
  );
}
