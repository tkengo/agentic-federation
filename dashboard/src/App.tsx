import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
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
import { FooterProvider, useFooter } from "./contexts/FooterContext.js";
import { useSessions } from "./hooks/useSessions.js";
import { useSessionWatcher } from "./hooks/useSessionWatcher.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { switchToTmuxSession } from "./utils/tmux.js";
import { REPOS_DIR } from "./utils/types.js";
import type { SessionData, RepoInfo, WorkflowInfo } from "./utils/types.js";

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
  const { sessions, refresh, refreshSessions, cleanableCount } = useSessions();
  const [screen, setScreen] = useState<Screen>("splash");
  const [createStep, setCreateStep] = useState<"workflow" | "repo" | "branch" | "session-name">("workflow");
  const lastCtrlCRef = useRef(0);

  const { showMessage, setCtrlCPending, state: footerState } = useFooter();

  // Active session reported by Home (used by FeedbackInput, CommandPalette)
  const [activeSession, setActiveSession] = useState<SessionData | undefined>();

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
            const repoRoot = raw.repo_root ?? path.join(raw.base_path, `${raw.repo_name}-workspace`, "main");
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

  // Create new session via fed start --no-attach
  const createSession = useCallback(
    (repo: string, branch: string, workflow: string) => {
      try {
        let args: string[];
        if (repo) {
          // Repo mode
          args = ["fed", "start", workflow, repo, branch, "--no-attach"];
        } else {
          // Standalone mode: branch param is actually the session name
          args = ["fed", "start", workflow, "--session-name", branch, "--no-attach"];
        }
        execSync(args.join(" "), { stdio: "inherit" });
        if (process.stdin.isTTY && process.stdin.setRawMode) {
          process.stdin.setRawMode(true);
        }
        process.stdout.write("\x1b[2J\x1b[H");
        refresh();
        showMessage(`Created session: ${branch}`);
        // Auto-switch to the new tmux session
        const ok = switchToTmuxSession(branch);
        if (ok) {
          showMessage(`Detached from ${branch}`);
        }
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
        sessionCount={sessions.length}
        cleanableCount={cleanableCount}
        repoCount={repos.length}
        workflowCount={workflows.length}
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
            repos={repos}
            workflows={workflows}
            cleanableCount={cleanableCount}
            active={screen === "list"}
            columns={columns}
            rows={rows}
            refresh={refresh}
            refreshRepos={refreshRepos}
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
          />
        )}

        {/* Add repo panel - bottom-aligned */}
        {screen === "add-repo" && (
          <AddRepo
            onSubmitClone={addRepoClone}
            onSubmitLocal={addRepoLocal}
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

      <Footer />
    </Box>
  );
}
