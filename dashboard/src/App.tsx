import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import fs from "node:fs";
import path from "node:path";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Header, HEADER_HEIGHT_FULL, HEADER_HEIGHT_COMPACT } from "./components/Header.js";
import { Home } from "./components/Home.js";
import { SessionDetail } from "./components/SessionDetail.js";
import { RepoDetail } from "./components/RepoDetail.js";
import { CreateSession } from "./components/CreateSession.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { Footer } from "./components/Footer.js";
import { Splash } from "./components/Splash.js";
import { AddRepo } from "./components/AddRepo.js";
import { BottomPanel } from "./components/BottomPanel.js";
import { FooterProvider, useFooter } from "./contexts/FooterContext.js";
import { useSessions } from "./hooks/useSessions.js";
import { useProtectedWorktrees } from "./hooks/useProtectedWorktrees.js";
import { useSessionWatcher } from "./hooks/useSessionWatcher.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { switchToTmuxSession, listTmuxSessions } from "./utils/tmux.js";
import { REPOS_DIR, LOGS_DIR } from "./utils/types.js";
import type { SessionData, RepoInfo, WorkflowInfo, LogFileInfo } from "./utils/types.js";

type Screen = "splash" | "list" | "create" | "palette" | "add-repo" | "detail" | "repo-detail";

// Outer shell: wraps with FooterProvider so children can use useFooter()
export function App() {
  return (
    <FooterProvider>
      <AppInner />
    </FooterProvider>
  );
}

function AppInner() {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const { sessions, refresh, refreshSessions, cleanableCount, protectedCount } = useSessions();
  const { protectedWorktrees, refreshProtected } = useProtectedWorktrees();
  const [screen, setScreen] = useState<Screen>("splash");
  const [createStep, setCreateStep] = useState<"workflow" | "repo" | "branch" | "session-name">("workflow");
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const lastCtrlCRef = useRef(0);

  const { showMessage, showError, setOverride, clearOverride, setCtrlCPending, state: footerState } = useFooter();

  // Active session reported by Home (used by CommandPalette)
  const [activeSession, setActiveSession] = useState<SessionData | undefined>();

  // Session name to focus after creation (passed to Home)
  const [focusSessionName, setFocusSessionName] = useState<string | null>(null);

  // Pending action from CommandPalette to Home
  const [pendingHomeAction, setPendingHomeAction] = useState<string | null>(null);

  // Detail screen: which session to show
  const [detailSessionName, setDetailSessionName] = useState<string | null>(null);
  const detailSession = detailSessionName
    ? sessions.find((s) => s.name === detailSessionName)
    : undefined;

  // Auto-back if session disappears while on detail screen
  useEffect(() => {
    if (screen === "detail" && detailSessionName && !detailSession) {
      setScreen("list");
      setDetailSessionName(null);
    }
  }, [screen, detailSessionName, detailSession]);

  // Load repos from ~/.fed/repos/ with config details and tmux session status
  const loadRepos = useCallback((): RepoInfo[] => {
    try {
      if (!fs.existsSync(REPOS_DIR)) return [];
      const tmuxSessions = listTmuxSessions();
      return fs
        .readdirSync(REPOS_DIR)
        .filter((f) => f.endsWith(".json"))
        .map((f) => {
          const name = f.replace(/\.json$/, "");
          try {
            const raw = JSON.parse(fs.readFileSync(path.join(REPOS_DIR, f), "utf-8"));
            const repoRoot = raw.repo_root ?? path.join(raw.base_path, `${raw.repo_name}-workspace`, "main");
            return { name, repoRoot, tmuxAlive: tmuxSessions.has(`__repo_${name}`) };
          } catch {
            return { name, repoRoot: "", tmuxAlive: tmuxSessions.has(`__repo_${name}`) };
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

  // Load log files from ~/.fed/logs/
  const loadLogs = useCallback((): LogFileInfo[] => {
    try {
      if (!fs.existsSync(LOGS_DIR)) return [];
      return fs
        .readdirSync(LOGS_DIR)
        .filter((f) => f.endsWith(".log"))
        .map((f) => {
          const fullPath = path.join(LOGS_DIR, f);
          const stat = fs.statSync(fullPath);
          return {
            name: f,
            date: f.replace(/\.log$/, ""),
            size: stat.size,
            path: fullPath,
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date));
    } catch {
      return [];
    }
  }, []);

  const [logs, setLogs] = useState<LogFileInfo[]>(loadLogs);

  const refreshLogs = useCallback(() => {
    setLogs(loadLogs());
  }, [loadLogs]);

  // Detail screen: which repo to show
  const [detailRepoName, setDetailRepoName] = useState<string | null>(null);
  const detailRepo = detailRepoName
    ? repos.find((r) => r.name === detailRepoName)
    : undefined;

  // Auto-back if repo disappears while on repo-detail screen
  useEffect(() => {
    if (screen === "repo-detail" && detailRepoName && !detailRepo) {
      setScreen("list");
      setDetailRepoName(null);
    }
  }, [screen, detailRepoName, detailRepo]);

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
            && fs.existsSync(path.join(dirPath, "workflow-v2.yaml"));
        })
        .map((d) => {
          let description = "";
          try {
            const content = fs.readFileSync(path.join(workflowsDir, d, "workflow-v2.yaml"), "utf-8");
            const match = content.match(/^description:\s*"?([^"\n]+)"?\s*$/m);
            if (match) description = match[1]!.trim();
          } catch { /* ignore */ }
          return { name: d, description };
        });
    } catch {
      return [];
    }
  }, []);

  // Watch for file changes (lightweight: session list, no cleanable count)
  const refreshAllSessions = useCallback(() => {
    refreshSessions();
  }, [refreshSessions]);
  useSessionWatcher(refreshAllSessions);

  // Create new session via fed session start --no-attach
  const createSession = useCallback(
    (repo: string, branch: string, workflow: string, from?: string) => {
      let cliArgs: string[];
      if (repo) {
        if (from) {
          // Track remote branch mode
          cliArgs = ["session", "start", workflow, repo, "--from", from, "--no-attach"];
        } else if (branch) {
          cliArgs = ["session", "start", workflow, repo, branch, "--no-attach"];
        } else {
          // Auto-generate branch name (omit branch argument)
          cliArgs = ["session", "start", workflow, repo, "--no-attach"];
        }
      } else {
        if (branch) {
          // Standalone mode: branch param is actually the session name
          cliArgs = ["session", "start", workflow, "--session-name", branch, "--no-attach"];
        } else {
          // Standalone mode: auto-generate session name
          cliArgs = ["session", "start", workflow, "--no-attach"];
        }
      }

      setIsCreatingSession(true);

      // Strip TMUX env so `fed session start` passes its outside-tmux check
      const { TMUX: _tmux, ...cleanEnv } = process.env;
      const proc = spawn("fed", cliArgs, {
        stdio: ["ignore", "pipe", "pipe"],
        env: cleanEnv,
      });
      let stdout = "";
      proc.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
      proc.on("close", (code) => {
        setIsCreatingSession(false);
        setScreen("list");
        refresh();
        if (code === 0) {
          // Extract auto-generated branch name from CLI output if branch was empty
          const autoMatch = stdout.match(/Auto-generated (?:branch|session): (.+)/);
          const sessionLabel = branch || autoMatch?.[1] || "auto";
          setFocusSessionName(sessionLabel);
          showMessage(`Created session: ${sessionLabel}`);
          // Defer tmux switch to let Ink flush pending renders
          setTimeout(() => {
            const ok = switchToTmuxSession(sessionLabel);
            if (ok) {
              showMessage(`Detached from ${sessionLabel}`);
            }
          }, 50);
        } else {
          showError(`Failed to create session: ${branch || "auto"}`);
        }
      });
      proc.on("error", () => {
        setIsCreatingSession(false);
        setScreen("list");
        showError(`Failed to create session: ${branch || "auto"}`);
      });
    },
    [refresh, showMessage, showError]
  );

  // Add a new repo via fed repo add (clone)
  const addRepoClone = useCallback(
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

  // Add a local repo via fed repo add-local
  const addRepoLocal = useCallback(
    (repoPath: string, basePath: string) => {
      try {
        const args = ["fed", "repo", "add-local", `'${repoPath}'`];
        if (basePath && basePath !== "~/fed/repos") {
          args.push(`'${basePath}'`);
        }
        execSync(args.join(" "), { stdio: "inherit" });
        if (process.stdin.isTTY && process.stdin.setRawMode) {
          process.stdin.setRawMode(true);
        }
        process.stdout.write("\x1b[2J\x1b[H");
        refreshRepos();
        showMessage("Local repository added successfully");
      } catch {
        if (process.stdin.isTTY && process.stdin.setRawMode) {
          process.stdin.setRawMode(true);
        }
        process.stdout.write("\x1b[2J\x1b[H");
        showMessage("Failed to add local repository");
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
    { isActive: true }
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

  const isDetail = screen === "detail" || screen === "repo-detail";

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Header
        cleanableCount={cleanableCount}
        compact={isDetail}
      />

      <Box
        borderStyle="single"
        borderTop={false}
        borderBottom={false}
        flexDirection="column"
        paddingY={0}
        flexGrow={1}
        overflow="hidden"
      >
        {/* Home screen - always mounted to preserve cursor position, hidden during detail */}
        <Box display={!isDetail ? "flex" : "none"} flexDirection="column" flexGrow={1}>
          <Home
            sessions={sessions}
            protectedWorktrees={protectedWorktrees}
            repos={repos}
            logs={logs}
            workflows={workflows}
            cleanableCount={cleanableCount}
            active={screen === "list"}
            columns={columns}
            rows={rows}
            refresh={refresh}
            refreshProtected={refreshProtected}
            refreshRepos={refreshRepos}
            refreshLogs={refreshLogs}
            onNavigate={(target) => {
              if (target === "create") setCreateStep("workflow");
              setScreen(target);
            }}
            onDetailSession={(name) => {
              setDetailSessionName(name);
              setScreen("detail");
            }}
            onDetailRepo={(name) => {
              setDetailRepoName(name);
              setScreen("repo-detail");
            }}
            onSelectedSessionChange={setActiveSession}
            pendingAction={pendingHomeAction}
            onActionHandled={() => setPendingHomeAction(null)}
            focusSessionName={focusSessionName}
            onFocusSessionHandled={() => setFocusSessionName(null)}
          />
        </Box>

        {/* Detail screen - full-screen session detail */}
        {screen === "detail" && detailSession && (
          <SessionDetail
            session={detailSession}
            columns={columns}
            rows={rows}
            headerHeight={HEADER_HEIGHT_COMPACT}
            refresh={refresh}
            onBack={() => {
              setScreen("list");
              setDetailSessionName(null);
            }}
          />
        )}

        {/* Repo detail screen */}
        {screen === "repo-detail" && detailRepo && (
          <RepoDetail
            repo={detailRepo}
            columns={columns}
            rows={rows}
            headerHeight={HEADER_HEIGHT_COMPACT}
            refreshRepos={refreshRepos}
            onBack={() => {
              setScreen("list");
              setDetailRepoName(null);
            }}
          />
        )}

        {/* Bottom panel - fixed height, always present on home screen */}
        {!isDetail && (
          <BottomPanel>
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
              />
            )}
            {screen === "add-repo" && (
              <AddRepo
                onSubmitClone={addRepoClone}
                onSubmitLocal={addRepoLocal}
                onCancel={() => setScreen("list")}
              />
            )}
            {screen === "create" && (
              <CreateSession
                repos={repos.map((r) => r.name)}
                workflows={workflows}
                sessions={sessions}
                isCreating={isCreatingSession}
                onSubmit={createSession}
                onCancel={() => setScreen("list")}
                onStepChange={setCreateStep}
              />
            )}
          </BottomPanel>
        )}
      </Box>

      <Footer />
    </Box>
  );
}
